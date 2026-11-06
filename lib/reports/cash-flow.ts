/**
 * Cash-flow statement computation (authoritative).
 *
 * This is the single shared place that builds a cash-flow statement so the REST
 * route and any other caller produce identical figures. It is layered on top of
 * the shared GL aggregation in {@link file://./gl-query.ts} — it does NOT issue
 * its own raw journal queries — so it inherits org-scoping, posted-only and the
 * natural-sign balance conventions from there.
 *
 * Two methods are supported:
 *
 *  - INDIRECT (default): start from net income for the period, add back non-cash
 *    expenses (depreciation, identified via `journalEntry.sourceType =
 *    'depreciation'`), then adjust for working-capital movements (AR / AP /
 *    inventory / other current items). Investing = fixed-asset deltas less
 *    depreciation; financing = loan balance movements + equity deltas. Accounts
 *    are classified by {@link classifyCashFlowAccount}.
 *
 *  - DIRECT: operating cash is the income statement on the cash basis (money
 *    received from customers less money paid for costs); investing and
 *    financing are classified as for the indirect method.
 *
 * Cross-check: regardless of method, the computed net change in cash is
 * reconciled against the movement on the cash/bank accounts themselves
 * (closing − opening). The difference is surfaced as `reconciliation` so callers
 * can flag a statement that does not tie out.
 *
 * All amounts are integer minor units (cents).
 */
import { db } from "@/lib/db";
import { chartAccount, journalEntry, journalLine } from "@/lib/db/schema";
import { matchesCode } from "@/lib/api/account-roles";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  aggregateAsAt,
  aggregateByDateRange,
  type AccountAggregate,
  type DateRange,
  type ReportBasis,
} from "./gl-query";

/** Cash-flow presentation method. */
export type CashFlowMethod = "indirect" | "direct";

/** What an account is for the cash-flow statement. */
export type CashFlowClass =
  | "cash"
  | "receivables"
  | "payables"
  | "inventory"
  | "fixed"
  | "loan"
  | "workingCapital"
  | "equity"
  | "profitAndLoss";

/**
 * Classify an account for the cash-flow statement.
 *
 * The standard charts mark most balance-sheet accounts with the generic
 * subTypes `current` / `fixed` / `non_current` / `bank`, so the specific
 * accounts are recognised by the canonical role codes they play (an
 * account's own code in a legacy chart, its `roles` in a role-mapped one):
 *   cash        bank accounts (subType bank/cash), Cash 1000, Petty Cash 1010,
 *               Undeposited Funds 1250
 *   receivables Accounts Receivable 1200
 *   payables    Accounts Payable 2000 / 2100
 *   inventory   1300 / 1310 / 1320
 *   fixed       fixed-asset accounts (subType fixed / non_current), including
 *               accumulated depreciation
 *   loan        loans and long-term debt: 2500, 2510, 2700, 2800 and any
 *               non-current liability
 * Older explicit subTypes (accounts_receivable, inventory, fixed_asset, ...)
 * still work. Every other asset or liability is working capital.
 */
export function classifyCashFlowAccount(a: {
  type: AccountAggregate["type"];
  subType: string | null;
  code: string;
  roles?: string[] | null;
}): CashFlowClass {
  const plays = (...codes: string[]) => codes.some((c) => matchesCode(a, c));
  const sub = a.subType ?? "";
  if (a.type === "revenue" || a.type === "expense") return "profitAndLoss";
  if (a.type === "equity") return "equity";
  if (a.type === "asset") {
    if (sub === "bank" || sub === "cash" || plays("1000", "1010", "1250")) return "cash";
    if (sub === "accounts_receivable" || plays("1200")) return "receivables";
    if (sub === "inventory" || plays("1300", "1310", "1320")) return "inventory";
    if (["fixed", "non_current", "fixed_asset", "property_plant_equipment"].includes(sub)) return "fixed";
    return "workingCapital";
  }
  if (sub === "accounts_payable" || plays("2000", "2100")) return "payables";
  if (["non_current", "long_term", "long_term_liability"].includes(sub) || plays("2500", "2510", "2700", "2800")) {
    return "loan";
  }
  return "workingCapital";
}

/** Load each account's canonical roles so classification can be role-aware. */
async function loadAccountRoles(organizationId: string): Promise<Map<string, string[] | null>> {
  const rows = await db
    .select({ id: chartAccount.id, roles: chartAccount.roles })
    .from(chartAccount)
    .where(eq(chartAccount.organizationId, organizationId));
  return new Map(rows.map((r) => [r.id, r.roles ?? null]));
}

/** Return the calendar day immediately before an ISO YYYY-MM-DD date. */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface CashFlowLineItem {
  accountId?: string;
  code?: string;
  name: string;
  /** Cash effect in integer cents (positive = inflow, negative = outflow). */
  amount: number;
}

export interface OperatingActivities {
  netIncome: number;
  /** Non-cash depreciation added back (positive). */
  depreciation: number;
  workingCapitalChanges: {
    /** Cash effect of AR movement (increase in AR = outflow = negative). */
    accountsReceivable: number;
    /** Cash effect of AP movement (increase in AP = inflow = positive). */
    accountsPayable: number;
    /** Cash effect of inventory movement (increase = outflow = negative). */
    inventory: number;
    /**
     * Cash effect of every other current asset / liability (prepayments, VAT,
     * accruals, wages payable, credit cards...).
     */
    other: number;
  };
  /** Net cash from operating activities. */
  total: number;
}

export interface InvestingActivities {
  items: CashFlowLineItem[];
  total: number;
}

export interface FinancingActivities {
  /** Cash effect of loan balance movements (borrowing positive, repayment negative). */
  loanPayments: number;
  /** Cash effect of equity movements (issuance positive, drawings negative). */
  equityChanges: number;
  items: CashFlowLineItem[];
  total: number;
}

/** Reconciliation of the indirect/direct net change vs. actual cash movement. */
export interface CashReconciliation {
  /** Net change derived from the activity sections. */
  computedNetChange: number;
  /** Actual movement on cash/bank accounts (closing − opening). */
  cashAccountMovement: number;
  /** computedNetChange − cashAccountMovement; 0 means the statement ties out. */
  difference: number;
  /** Convenience flag: true when |difference| === 0. */
  balanced: boolean;
}

export interface CashFlowStatement {
  startDate: string;
  endDate: string;
  method: CashFlowMethod;
  basis: ReportBasis;
  openingCashBalance: number;
  operatingActivities: OperatingActivities;
  investingActivities: InvestingActivities;
  financingActivities: FinancingActivities;
  netCashChange: number;
  closingCashBalance: number;
  reconciliation: CashReconciliation;
}

export interface CashFlowOptions {
  /** 'indirect' (default) or 'direct'. */
  method?: CashFlowMethod;
  /** Reporting basis passed through to gl-query. Defaults to 'accrual'. */
  basis?: ReportBasis;
}

/**
 * Sum the period debit on entries whose `sourceType` matches, restricted to the
 * org/posted/date window. Used for depreciation add-back and loan movements,
 * which are identified by entry sourceType rather than by account subType.
 */
async function sumBySourceType(
  organizationId: string,
  range: DateRange,
  sourceType: string,
  column: "debit" | "credit"
): Promise<number> {
  const expr =
    column === "debit"
      ? sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`
      : sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`;

  const [row] = await db
    .select({ total: expr })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt),
        eq(journalEntry.sourceType, sourceType),
        gte(journalEntry.date, range.startDate),
        lte(journalEntry.date, range.endDate)
      )
    );
  return Number(row?.total ?? 0);
}

/**
 * Credits posted to each account by depreciation entries in the period. The
 * accumulated-depreciation side of a depreciation charge is not an investing
 * cash flow (the charge is added back in operating instead).
 */
async function depreciationCreditsByAccount(
  organizationId: string,
  range: DateRange
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      accountId: journalLine.accountId,
      total: sql<number>`coalesce(sum(${journalLine.creditAmount}) - sum(${journalLine.debitAmount}), 0)`,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt),
        eq(journalEntry.sourceType, "depreciation"),
        gte(journalEntry.date, range.startDate),
        lte(journalEntry.date, range.endDate)
      )
    )
    .groupBy(journalLine.accountId);
  return new Map(rows.map((r) => [r.accountId, Number(r.total)]));
}

type Classifier = (a: AccountAggregate) => CashFlowClass;

/** Cumulative cash/bank balance as at a date (natural debit-positive). */
async function cashBalanceAsAt(
  organizationId: string,
  asAt: string,
  basis: ReportBasis,
  classify: Classifier
): Promise<number> {
  const assets = await aggregateAsAt(organizationId, asAt, {
    basis,
    accountTypes: ["asset"],
  });
  return assets
    .filter((a) => classify(a) === "cash")
    .reduce((sum, a) => sum + a.balance, 0);
}

/**
 * Build a cash-flow statement for the period using the shared GL aggregation.
 */
export async function buildCashFlow(
  organizationId: string,
  range: DateRange,
  opts: CashFlowOptions = {}
): Promise<CashFlowStatement> {
  const method: CashFlowMethod = opts.method ?? "indirect";
  const basis: ReportBasis = opts.basis ?? "accrual";

  const roles = await loadAccountRoles(organizationId);
  const classify: Classifier = (a) => classifyCashFlowAccount({ ...a, roles: roles.get(a.accountId) ?? null });

  // One aggregation of the period's activity across all account types; we slice
  // it by classification below instead of issuing several queries.
  const periodAccounts = await aggregateByDateRange(organizationId, range, {
    basis,
  });

  // Opening / closing cash from the cash/bank accounts (cumulative balances).
  const openingCash = await cashBalanceAsAt(
    organizationId,
    dayBefore(range.startDate),
    basis,
    classify
  );
  const closingCash = await cashBalanceAsAt(organizationId, range.endDate, basis, classify);
  const cashAccountMovement = closingCash - openingCash;

  let operatingActivities: OperatingActivities;
  let investingActivities: InvestingActivities;
  let financingActivities: FinancingActivities;

  if (method === "direct") {
    ({ operatingActivities, investingActivities, financingActivities } =
      await buildDirect(organizationId, range, periodAccounts, classify));
  } else {
    ({ operatingActivities, investingActivities, financingActivities } =
      await buildIndirect(organizationId, range, periodAccounts, classify));
  }

  const netCashChange =
    operatingActivities.total +
    investingActivities.total +
    financingActivities.total;

  const reconciliation: CashReconciliation = {
    computedNetChange: netCashChange,
    cashAccountMovement,
    difference: netCashChange - cashAccountMovement,
    balanced: netCashChange - cashAccountMovement === 0,
  };

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    method,
    basis,
    openingCashBalance: openingCash,
    operatingActivities,
    investingActivities,
    financingActivities,
    netCashChange,
    // Anchor closing on actual opening + computed change so the statement reads
    // consistently; the reconciliation line exposes any drift vs. the ledger.
    closingCashBalance: openingCash + netCashChange,
    reconciliation,
  };
}

/** Indirect method: net income + depreciation add-back ± working capital. */
async function buildIndirect(
  organizationId: string,
  range: DateRange,
  periodAccounts: AccountAggregate[],
  classify: Classifier
): Promise<{
  operatingActivities: OperatingActivities;
  investingActivities: InvestingActivities;
  financingActivities: FinancingActivities;
}> {
  const of = (cls: CashFlowClass) => periodAccounts.filter((a) => classify(a) === cls);
  const sum = (accts: AccountAggregate[]) => accts.reduce((s, a) => s + a.balance, 0);

  // Net income = revenue balance − expense balance (both natural-signed).
  const totalRevenue = sum(periodAccounts.filter((a) => a.type === "revenue"));
  const totalExpenses = sum(periodAccounts.filter((a) => a.type === "expense"));
  const netIncome = totalRevenue - totalExpenses;

  // Depreciation add-back: debit posted on depreciation-sourced entries.
  const depreciation = await sumBySourceType(
    organizationId,
    range,
    "depreciation",
    "debit"
  );

  // Working-capital deltas (natural-signed period movement). An asset going
  // up ties up cash (outflow); a liability going up keeps cash (inflow).
  const arDelta = sum(of("receivables"));
  const apDelta = sum(of("payables"));
  const inventoryDelta = sum(of("inventory"));
  const other = of("workingCapital").reduce(
    (s, a) => s + (a.type === "asset" ? -a.balance : a.balance),
    0
  );

  const operatingActivities: OperatingActivities = {
    netIncome,
    depreciation,
    workingCapitalChanges: {
      accountsReceivable: -arDelta, // AR up = cash tied up = outflow
      accountsPayable: apDelta, // AP up = cash retained = inflow
      inventory: -inventoryDelta, // inventory up = outflow
      other,
    },
    total: netIncome + depreciation - arDelta + apDelta - inventoryDelta + other,
  };

  // Investing: fixed-asset movements (asset increase = cash outflow), leaving
  // out the depreciation credits (added back in operating already).
  const depCredits = await depreciationCreditsByAccount(organizationId, range);
  const fixedItems = of("fixed")
    .map((a) => ({
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      amount: -a.balance - (depCredits.get(a.accountId) ?? 0),
    }))
    .filter((i) => i.amount !== 0);
  const investingActivities: InvestingActivities = {
    items: fixedItems,
    total: fixedItems.reduce((s, i) => s + i.amount, 0),
  };

  // Financing: loan balances (borrowing = inflow, repayment = outflow) and
  // equity movements (capital in = inflow, drawings / dividends = outflow).
  const loans = of("loan");
  const loanPayments = sum(loans);
  const equityAccounts = of("equity");
  const equityChanges = sum(equityAccounts);

  const financingActivities: FinancingActivities = {
    loanPayments,
    equityChanges,
    items: [
      ...loans.map((a) => ({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        amount: a.balance,
      })),
      ...equityAccounts.map((a) => ({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        amount: a.balance,
      })),
    ].filter((i) => i.amount !== 0),
    total: loanPayments + equityChanges,
  };

  return { operatingActivities, investingActivities, financingActivities };
}

/**
 * Direct method variant.
 *
 * Operating cash is presented from the income side (revenue collected less
 * expenses paid, adjusted for non-cash depreciation), while investing and
 * financing reuse the same classification as the indirect method. This keeps a
 * direct-style operating section while still tying out via the reconciliation
 * line.
 */
async function buildDirect(
  organizationId: string,
  range: DateRange,
  periodAccounts: AccountAggregate[],
  classify: Classifier
): Promise<{
  operatingActivities: OperatingActivities;
  investingActivities: InvestingActivities;
  financingActivities: FinancingActivities;
}> {
  // Cash actually realised from revenue/expense: re-aggregate the income
  // statement on the cash basis (invoices and bills count when paid).
  const cashAccounts = await aggregateByDateRange(organizationId, range, {
    basis: "cash",
    accountTypes: ["revenue", "expense"],
  });
  const cashRevenue = cashAccounts
    .filter((a) => a.type === "revenue")
    .reduce((s, a) => s + a.balance, 0);
  const cashExpenses = cashAccounts
    .filter((a) => a.type === "expense")
    .reduce((s, a) => s + a.balance, 0);

  const operatingActivities: OperatingActivities = {
    // Reuse the same field shape; for the direct method netIncome carries the
    // cash collected from customers and depreciation stays 0 (depreciation is
    // never a cash entry, so the cash basis already leaves it out).
    netIncome: cashRevenue,
    depreciation: 0,
    workingCapitalChanges: {
      accountsReceivable: 0,
      accountsPayable: 0,
      inventory: 0,
      other: 0,
    },
    total: cashRevenue - cashExpenses,
  };

  // Investing / financing: identical classification to the indirect method.
  const indirect = await buildIndirect(organizationId, range, periodAccounts, classify);

  return {
    operatingActivities,
    investingActivities: indirect.investingActivities,
    financingActivities: indirect.financingActivities,
  };
}
