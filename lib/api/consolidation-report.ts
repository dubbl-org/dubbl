import {
  chartAccount,
  journalEntry,
  journalLine,
  consolidationEliminationRule,
  contact,
  invoice,
  bill,
} from "@/lib/db/schema";
import { eq, and, isNull, sql, gte, lte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  RateResolver,
  naturalBalance,
  computeCta,
  memberFunctionalCurrency,
} from "@/lib/api/consolidation-translate";

/**
 * Shared, pure (read-only) consolidation report computation used by BOTH the
 * REST GET route and the MCP `get_consolidation_report` tool, so the two paths
 * can never diverge again.
 *
 * What it does (IAS 21 / ASC 830 reporting-layer logic — never posts to a member
 * ledger):
 *   1. Pulls each member's posted GL balances in its functional currency.
 *   2. Translates per account type (assets/liabilities at closing, revenue/
 *      expenses at average, equity at historical).
 *   3. Computes the per-entity Cumulative Translation Adjustment (CTA) and
 *      INJECTS it as a consolidated equity line (code 3900) so the balance
 *      sheet foots: Assets = Liabilities + Equity(incl. CTA) + NetIncome.
 *   4. Applies intercompany eliminations, CAPPED by the intercompany document
 *      volume attributable to fellow members (so third-party balances on the
 *      same account-code prefixes are never over-eliminated).
 *
 * This function NEVER writes to the database. Persistence of elimination
 * entries is an explicit action handled by the route's POST/recalc handler.
 */

// Code under which the Cumulative Translation Adjustment lands in consolidated
// equity. Reporting-only — never posted to a member ledger.
const CTA_ACCOUNT_CODE = "3900";
const CTA_ACCOUNT_NAME = "Cumulative Translation Adjustment";
// Where the unmatched elimination residual is parked so the worksheet still
// foots when intercompany debits and credits don't perfectly net.
const ELIM_VARIANCE_NAME = "Intercompany Elimination Variance";

interface EntityBalance {
  orgId: string;
  label: string;
  orgName: string;
  functionalCurrency: string;
  accountType: string;
  accountName: string;
  accountCode: string;
  totalDebit: number;
  totalCredit: number;
}

interface AccountRow {
  type: string;
  name: string;
  code: string;
  total: number;
  byEntity: Record<string, number>;
}

export interface ConsolidatedReportResult {
  group: { id: string; name: string; presentationCurrency: string };
  members: {
    orgId: string;
    label: string;
    orgName: string;
    functionalCurrency: string;
  }[];
  startDate: string;
  endDate: string;
  presentationCurrency: string;
  consolidatedPnL: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    byEntity: {
      orgId: string;
      label: string;
      revenue: number;
      expenses: number;
      netIncome: number;
    }[];
    accounts: AccountRow[];
  };
  consolidatedBalanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanceCheck: number;
    byEntity: {
      orgId: string;
      label: string;
      assets: number;
      liabilities: number;
      equity: number;
    }[];
    accounts: AccountRow[];
  };
  translation: {
    presentationCurrency: string;
    totalCta: number;
    ctaAccount: { code: string; name: string };
    byEntity: {
      orgId: string;
      label: string;
      functionalCurrency: string;
      cta: number;
    }[];
  };
  elimination: {
    totalEliminated: number;
    totalVariance: number;
    varianceLabel: string;
    entries: EliminationResult[];
  };
}

export interface EliminationResult {
  ruleId: string;
  name: string;
  kind: string;
  debitAccountMatch: string | null;
  creditAccountMatch: string | null;
  eliminated: number;
  variance: number;
  /** Set when a misconfigured rule was skipped/flagged (e.g. ar_ap legs that
   * don't map to asset/liability accounts). */
  skipped?: boolean;
  skipReason?: string;
}

type OwnedGroup = {
  id: string;
  name: string;
  parentOrgId: string;
  presentationCurrency: string;
  members: {
    orgId: string;
    label: string | null;
    functionalCurrency: string | null;
    organization: { name: string; defaultCurrency: string | null };
  }[];
};

function emptyReport(
  group: { id: string; name: string; presentationCurrency: string },
  startDate: string,
  endDate: string
): ConsolidatedReportResult {
  const presentationCurrency = group.presentationCurrency;
  return {
    group: { id: group.id, name: group.name, presentationCurrency },
    members: [],
    startDate,
    endDate,
    presentationCurrency,
    consolidatedPnL: {
      totalRevenue: 0,
      totalExpenses: 0,
      netIncome: 0,
      byEntity: [],
      accounts: [],
    },
    consolidatedBalanceSheet: {
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      balanceCheck: 0,
      byEntity: [],
      accounts: [],
    },
    translation: {
      presentationCurrency,
      totalCta: 0,
      ctaAccount: { code: CTA_ACCOUNT_CODE, name: CTA_ACCOUNT_NAME },
      byEntity: [],
    },
    elimination: {
      totalEliminated: 0,
      totalVariance: 0,
      varianceLabel: ELIM_VARIANCE_NAME,
      entries: [],
    },
  };
}

/**
 * Compute the consolidated worksheet for a group over a window. Pure/read-only:
 * the `group` is provided by the caller (already authorized + scoped to the
 * caller's org). Returns a result whose balance sheet FOOTS once CTA is folded
 * into equity and eliminations are applied.
 */
export async function computeConsolidatedReport(
  group: OwnedGroup,
  opts: { startDate: string; endDate: string }
): Promise<ConsolidatedReportResult> {
  const { startDate, endDate } = opts;
  const presentationCurrency = group.presentationCurrency;

  if (group.members.length === 0) {
    return emptyReport(group, startDate, endDate);
  }

  const memberOrgIds = group.members.map((m) => m.orgId);

  // Rate resolver scoped to this report run (period end = closing date).
  const resolver = new RateResolver(
    {
      id: group.id,
      parentOrgId: group.parentOrgId,
      presentationCurrency,
    },
    endDate
  );

  // Fetch GL balances for all member orgs.
  const allBalances: EntityBalance[] = [];

  for (const m of group.members) {
    const functionalCurrency = memberFunctionalCurrency(
      m.functionalCurrency,
      m.organization.defaultCurrency,
      presentationCurrency
    );

    const balances = await db
      .select({
        accountType: chartAccount.type,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        totalDebit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`,
        totalCredit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(
        and(
          eq(journalEntry.organizationId, m.orgId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate)
        )
      )
      .groupBy(chartAccount.type, chartAccount.name, chartAccount.code);

    for (const b of balances) {
      allBalances.push({
        orgId: m.orgId,
        label: m.label || m.organization.name,
        orgName: m.organization.name,
        functionalCurrency,
        accountType: b.accountType,
        accountName: b.accountName,
        accountCode: b.accountCode,
        totalDebit: Number(b.totalDebit),
        totalCredit: Number(b.totalCredit),
      });
    }
  }

  // --- translation + per-entity / consolidated aggregation -----------------

  // P&L
  const pnlEntityMap = new Map<string, { revenue: number; expenses: number }>();
  const pnlAccountMap = new Map<string, AccountRow>();
  // Balance sheet
  const bsEntityMap = new Map<
    string,
    { assets: number; liabilities: number; equity: number }
  >();
  const bsAccountMap = new Map<string, AccountRow>();

  for (const b of allBalances) {
    const accountKey = `${b.accountType}:${b.accountCode}:${b.accountName}`;
    // Natural-side balance in the member's functional currency, then translated
    // into presentation currency at the IAS 21 rate for its account type.
    const fc = naturalBalance(b.accountType, b.totalDebit, b.totalCredit);
    const balance = await resolver.translate(fc, b.functionalCurrency, b.accountType);

    if (b.accountType === "revenue" || b.accountType === "expense") {
      if (!pnlEntityMap.has(b.orgId)) {
        pnlEntityMap.set(b.orgId, { revenue: 0, expenses: 0 });
      }
      const entity = pnlEntityMap.get(b.orgId)!;
      if (!pnlAccountMap.has(accountKey)) {
        pnlAccountMap.set(accountKey, {
          type: b.accountType,
          name: b.accountName,
          code: b.accountCode,
          total: 0,
          byEntity: {},
        });
      }
      const account = pnlAccountMap.get(accountKey)!;
      if (b.accountType === "revenue") entity.revenue += balance;
      else entity.expenses += balance;
      account.total += balance;
      account.byEntity[b.orgId] = (account.byEntity[b.orgId] || 0) + balance;
    } else {
      if (!bsEntityMap.has(b.orgId)) {
        bsEntityMap.set(b.orgId, { assets: 0, liabilities: 0, equity: 0 });
      }
      const entity = bsEntityMap.get(b.orgId)!;
      if (!bsAccountMap.has(accountKey)) {
        bsAccountMap.set(accountKey, {
          type: b.accountType,
          name: b.accountName,
          code: b.accountCode,
          total: 0,
          byEntity: {},
        });
      }
      const account = bsAccountMap.get(accountKey)!;
      if (b.accountType === "asset") entity.assets += balance;
      else if (b.accountType === "liability") entity.liabilities += balance;
      else entity.equity += balance;
      account.total += balance;
      account.byEntity[b.orgId] = (account.byEntity[b.orgId] || 0) + balance;
    }
  }

  // Members info
  const membersInfo = group.members.map((m) => ({
    orgId: m.orgId,
    label: m.label || m.organization.name,
    orgName: m.organization.name,
    functionalCurrency: memberFunctionalCurrency(
      m.functionalCurrency,
      m.organization.defaultCurrency,
      presentationCurrency
    ),
  }));

  // Per-entity CTA: the plug that makes each member's translated balance sheet
  // foot once current-period net income is folded into equity. Summing the
  // member CTAs gives the group CTA (translation is linear per member).
  const ctaByEntity = membersInfo.map((m) => {
    const bs = bsEntityMap.get(m.orgId) || { assets: 0, liabilities: 0, equity: 0 };
    const pnl = pnlEntityMap.get(m.orgId) || { revenue: 0, expenses: 0 };
    const netIncome = pnl.revenue - pnl.expenses;
    const cta = computeCta({
      translatedAssets: bs.assets,
      translatedLiabilities: bs.liabilities,
      translatedEquity: bs.equity,
      translatedNetIncome: netIncome,
    });
    return {
      orgId: m.orgId,
      label: m.label,
      functionalCurrency: m.functionalCurrency,
      cta,
    };
  });
  const totalCta = ctaByEntity.reduce((s, e) => s + e.cta, 0);

  // Inject the CTA as a consolidated equity line so the balance sheet foots.
  if (totalCta !== 0) {
    const ctaKey = `equity:${CTA_ACCOUNT_CODE}:${CTA_ACCOUNT_NAME}`;
    const byEntity: Record<string, number> = {};
    for (const e of ctaByEntity) if (e.cta !== 0) byEntity[e.orgId] = e.cta;
    bsAccountMap.set(ctaKey, {
      type: "equity",
      name: CTA_ACCOUNT_NAME,
      code: CTA_ACCOUNT_CODE,
      total: totalCta,
      byEntity,
    });
    for (const e of ctaByEntity) {
      if (e.cta === 0) continue;
      const ent = bsEntityMap.get(e.orgId) || { assets: 0, liabilities: 0, equity: 0 };
      ent.equity += e.cta;
      bsEntityMap.set(e.orgId, ent);
    }
  }

  // --- intercompany elimination --------------------------------------------

  const rules = await db.query.consolidationEliminationRule.findMany({
    where: and(
      eq(consolidationEliminationRule.groupId, group.id),
      notDeleted(consolidationEliminationRule.deletedAt)
    ),
  });

  // Intercompany invoice/bill totals (translated to presentation currency)
  // keyed by the rule kind they constrain. These cap how much of a matched
  // prefix balance is genuinely intercompany and therefore eliminable.
  const intercompany = await loadIntercompanyTotals({
    memberOrgIds,
    startDate,
    endDate,
    resolver,
  });

  // Translated, signed natural balances grouped by account code for matching,
  // carrying the account type so we can validate rule legs.
  const balanceByCode = new Map<string, { type: string; total: number }>();
  for (const acc of [...bsAccountMap.values(), ...pnlAccountMap.values()]) {
    const cur = balanceByCode.get(acc.code);
    if (cur) cur.total += acc.total;
    else balanceByCode.set(acc.code, { type: acc.type, total: acc.total });
  }

  const matchPrefix = (prefix: string | null): number => {
    if (!prefix) return 0;
    let sum = 0;
    for (const [code, v] of balanceByCode) {
      if (code.startsWith(prefix)) sum += v.total;
    }
    return sum;
  };

  // The dominant account type matched by a prefix (by absolute magnitude), used
  // to flag misconfigured ar_ap rules. Returns null when the prefix matches no
  // accounts at all.
  const matchedType = (prefix: string | null): string | null => {
    if (!prefix) return null;
    const byType = new Map<string, number>();
    for (const [code, v] of balanceByCode) {
      if (!code.startsWith(prefix)) continue;
      byType.set(v.type, (byType.get(v.type) || 0) + Math.abs(v.total));
    }
    let best: string | null = null;
    let bestMag = -1;
    for (const [type, mag] of byType) {
      if (mag > bestMag) {
        bestMag = mag;
        best = type;
      }
    }
    return best;
  };

  const eliminationResults: EliminationResult[] = [];

  for (const rule of rules) {
    // Best-effort hardening: an ar_ap rule must net an asset (intercompany AR)
    // leg against a liability (intercompany AP) leg. If the matched accounts
    // don't classify that way, the rule is misconfigured — skip it (with a
    // flag) rather than eliminating the wrong balances and breaking A=L+E.
    if (rule.kind === "ar_ap") {
      const dType = matchedType(rule.debitAccountMatch);
      const cType = matchedType(rule.creditAccountMatch);
      const debitOk = dType == null || dType === "asset";
      const creditOk = cType == null || cType === "liability";
      if (!debitOk || !creditOk) {
        eliminationResults.push({
          ruleId: rule.id,
          name: rule.name,
          kind: rule.kind,
          debitAccountMatch: rule.debitAccountMatch,
          creditAccountMatch: rule.creditAccountMatch,
          eliminated: 0,
          variance: 0,
          skipped: true,
          skipReason: `ar_ap rule expects debit leg to map to asset accounts and credit leg to liability accounts (got debit=${dType ?? "none"}, credit=${cType ?? "none"})`,
        });
        continue;
      }
    }

    // Magnitude of each leg available to eliminate, from translated balances.
    const debitSide = Math.abs(matchPrefix(rule.debitAccountMatch));
    const creditSide = Math.abs(matchPrefix(rule.creditAccountMatch));

    // Cap the eliminable amount by the intercompany volume we can actually
    // attribute to fellow members (so third-party balances on the same
    // accounts are never wrongly eliminated). When we have no intercompany
    // signal for the kind, fall back to the matched min of the two legs.
    const icCap = intercompanyCapForKind(rule.kind, intercompany);
    const matched = Math.min(debitSide, creditSide);
    const eliminated = icCap != null ? Math.min(matched, icCap) : matched;
    // Residual on the larger leg that couldn't be netted off.
    const variance = Math.max(debitSide, creditSide) - eliminated;

    eliminationResults.push({
      ruleId: rule.id,
      name: rule.name,
      kind: rule.kind,
      debitAccountMatch: rule.debitAccountMatch,
      creditAccountMatch: rule.creditAccountMatch,
      eliminated,
      variance,
    });
  }

  // Apply eliminations to the consolidated account rows by reducing each
  // matched account-code prefix's contribution. Eliminations are group-level,
  // so per-entity rows are left at their translated (pre-elimination) values.
  const applyEliminationToMaps = (prefix: string | null, amount: number) => {
    if (!prefix || amount === 0) return;
    // Draw down the natural-side magnitude across all matching accounts until
    // the eliminated amount is exhausted, in both the BS and P&L account maps.
    for (const map of [bsAccountMap, pnlAccountMap]) {
      for (const acc of map.values()) {
        if (!acc.code.startsWith(prefix)) continue;
        const magnitude = Math.abs(acc.total);
        if (magnitude === 0) continue;
        const take = Math.sign(acc.total) * Math.min(magnitude, amount);
        acc.total -= take;
        amount -= Math.abs(take);
        if (amount <= 0) break;
      }
      if (amount <= 0) break;
    }
  };

  let totalEliminated = 0;
  let totalVariance = 0;
  for (const r of eliminationResults) {
    if (r.skipped) continue;
    totalEliminated += r.eliminated;
    totalVariance += r.variance;
    applyEliminationToMaps(r.debitAccountMatch, r.eliminated);
    applyEliminationToMaps(r.creditAccountMatch, r.eliminated);
  }

  // Recompute consolidated totals AFTER CTA + elimination adjustments.
  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const acc of pnlAccountMap.values()) {
    if (acc.type === "revenue") totalRevenue += acc.total;
    else if (acc.type === "expense") totalExpenses += acc.total;
  }
  const netIncome = totalRevenue - totalExpenses;

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  for (const acc of bsAccountMap.values()) {
    if (acc.type === "asset") totalAssets += acc.total;
    else if (acc.type === "liability") totalLiabilities += acc.total;
    else totalEquity += acc.total;
  }

  // Per-entity P&L / BS rows (post-CTA; eliminations are group-level).
  const pnlByEntity = membersInfo.map((m) => {
    const e = pnlEntityMap.get(m.orgId) || { revenue: 0, expenses: 0 };
    return {
      orgId: m.orgId,
      label: m.label,
      revenue: e.revenue,
      expenses: e.expenses,
      netIncome: e.revenue - e.expenses,
    };
  });

  const bsByEntity = membersInfo.map((m) => {
    const e = bsEntityMap.get(m.orgId) || { assets: 0, liabilities: 0, equity: 0 };
    return {
      orgId: m.orgId,
      label: m.label,
      assets: e.assets,
      liabilities: e.liabilities,
      equity: e.equity,
    };
  });

  const pnlAccounts = Array.from(pnlAccountMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "revenue" ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  const bsAccounts = Array.from(bsAccountMap.values()).sort((a, b) => {
    const typeOrder: Record<string, number> = { asset: 0, liability: 1, equity: 2 };
    if (a.type !== b.type) return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
    return a.code.localeCompare(b.code);
  });

  return {
    group: { id: group.id, name: group.name, presentationCurrency },
    members: membersInfo,
    startDate,
    endDate,
    presentationCurrency,
    consolidatedPnL: {
      totalRevenue,
      totalExpenses,
      netIncome,
      byEntity: pnlByEntity,
      accounts: pnlAccounts,
    },
    consolidatedBalanceSheet: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      // Current-period net income closes to equity on the consolidated sheet.
      // After translation + CTA + elimination this identity should foot to ~0:
      //   Assets − Liabilities − (Equity incl. CTA) − NetIncome.
      balanceCheck: totalAssets - totalLiabilities - totalEquity - netIncome,
      byEntity: bsByEntity,
      accounts: bsAccounts,
    },
    translation: {
      presentationCurrency,
      totalCta,
      ctaAccount: { code: CTA_ACCOUNT_CODE, name: CTA_ACCOUNT_NAME },
      byEntity: ctaByEntity,
    },
    elimination: {
      totalEliminated,
      totalVariance,
      varianceLabel: ELIM_VARIANCE_NAME,
      entries: eliminationResults,
    },
  };
}

/**
 * Translated (presentation-currency) intercompany totals derived from documents
 * whose counterparty contact is linked to a fellow group member. These cap how
 * much of a matched account-prefix balance is genuinely intercompany and
 * therefore eliminable.
 */
async function loadIntercompanyTotals(args: {
  memberOrgIds: string[];
  startDate: string;
  endDate: string;
  resolver: RateResolver;
}): Promise<{ salesCogs: number; arAp: number }> {
  const { memberOrgIds, startDate, endDate, resolver } = args;
  if (memberOrgIds.length === 0) return { salesCogs: 0, arAp: 0 };

  // Contacts inside any member org that point at another member org.
  const linkedContacts = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(
        inArray(contact.organizationId, memberOrgIds),
        inArray(contact.linkedOrgId, memberOrgIds),
        // Don't treat a (mis)configured self-link as intercompany.
        ne(contact.linkedOrgId, contact.organizationId),
        isNull(contact.deletedAt)
      )
    );

  if (linkedContacts.length === 0) return { salesCogs: 0, arAp: 0 };

  const contactIds = linkedContacts.map((c) => c.id);

  // Intercompany sales = invoices issued to a linked counterparty in-period.
  const invoices = await db
    .select({
      contactId: invoice.contactId,
      subtotal: invoice.subtotal,
      amountDue: invoice.amountDue,
      currencyCode: invoice.currencyCode,
    })
    .from(invoice)
    .where(
      and(
        inArray(invoice.contactId, contactIds),
        ne(invoice.status, "draft"),
        ne(invoice.status, "void"),
        isNull(invoice.deletedAt),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate)
      )
    );

  // Intercompany purchases = bills received from a linked counterparty in-period.
  const bills = await db
    .select({
      contactId: bill.contactId,
      subtotal: bill.subtotal,
      amountDue: bill.amountDue,
      currencyCode: bill.currencyCode,
    })
    .from(bill)
    .where(
      and(
        inArray(bill.contactId, contactIds),
        ne(bill.status, "draft"),
        ne(bill.status, "void"),
        isNull(bill.deletedAt),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate)
      )
    );

  let salesCogs = 0;
  let arAp = 0;

  for (const inv of invoices) {
    salesCogs += await resolver.translateAt(inv.subtotal, inv.currencyCode, "average");
    arAp += await resolver.translateAt(inv.amountDue, inv.currencyCode, "closing");
  }
  for (const b of bills) {
    salesCogs += await resolver.translateAt(b.subtotal, b.currencyCode, "average");
    arAp += await resolver.translateAt(b.amountDue, b.currencyCode, "closing");
  }

  // A matched intercompany pair (one member's invoice == the other's bill) is
  // counted on both sides above; the eliminable amount is the volume of one
  // side, so halve the doubled total. NOTE: this halving assumes symmetric
  // booking — that every intercompany invoice has a corresponding bill (and
  // vice versa) at the same value. If only one side has booked the document
  // (timing/missing entry), the halved cap will under- or over-state the true
  // eliminable intercompany volume.
  return { salesCogs: Math.round(salesCogs / 2), arAp: Math.round(arAp / 2) };
}

/**
 * Intercompany cap (presentation cents) for a rule kind, or null when there is
 * no intercompany signal and the matched-min fallback should be used.
 */
function intercompanyCapForKind(
  kind: string,
  ic: { salesCogs: number; arAp: number }
): number | null {
  switch (kind) {
    case "ar_ap":
      return ic.arAp > 0 ? ic.arAp : null;
    case "sales_cogs":
      return ic.salesCogs > 0 ? ic.salesCogs : null;
    default:
      // custom / investment_equity: rely purely on prefix matching.
      return null;
  }
}
