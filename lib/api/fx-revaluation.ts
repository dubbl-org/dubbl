import { sql, eq, and, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organization,
  chartAccount,
  journalEntry,
  journalLine,
  invoice,
  bill,
} from "@/lib/db/schema";
import { getExchangeRate, convertAmount } from "@/lib/currency/converter";
import {
  revaluationLegs,
  reverseLegs,
  type SettlementLeg,
} from "@/lib/currency/convert-entry";

/**
 * Period-end unrealised FX revaluation (reverse-and-rebook).
 *
 * For each org, revalue open foreign-currency receivables (invoices) and
 * payables (bills) from their issue-date rate to the period-end rate, post the
 * unrealised gain/loss to the GL dated `asOfDate`, and post a reversing entry
 * dated `reversalDate` so the adjustment doesn't permanently accumulate. Posts
 * to Unrealised Currency Gains (4920) / Losses (5940), distinct from realised.
 *
 * No-op for single-currency orgs and when no rate movement is found.
 */

const UNREALISED_GAIN = {
  code: "4920",
  name: "Unrealised Currency Gains",
  type: "revenue" as const,
  subType: "non_operating",
};
const UNREALISED_LOSS = {
  code: "5940",
  name: "Unrealised Currency Losses",
  type: "expense" as const,
  subType: "non_operating",
};

type AccountDef = {
  code: string;
  name: string;
  type: "revenue" | "expense";
  subType: string;
};

async function findAccount(orgId: string, code: string) {
  return db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, orgId),
      eq(chartAccount.code, code)
    ),
  });
}

async function ensureAccount(orgId: string, def: AccountDef, base: string) {
  const existing = await findAccount(orgId, def.code);
  if (existing) return existing;
  await db
    .insert(chartAccount)
    .values({
      organizationId: orgId,
      code: def.code,
      name: def.name,
      type: def.type,
      subType: def.subType,
      currencyCode: base,
    })
    .onConflictDoNothing({
      target: [chartAccount.organizationId, chartAccount.code],
    });
  return findAccount(orgId, def.code);
}

async function nextEntryNumber(orgId: string) {
  const [m] = await db
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, orgId));
  return (m?.max || 0) + 1;
}

/** Sum the period-end-minus-issue base-value delta over a set of open docs. */
async function aggregateDelta(
  orgId: string,
  base: string,
  docs: { currencyCode: string; issueDate: string; amountDue: number }[],
  asOfDate: string
): Promise<number> {
  let delta = 0;
  for (const d of docs) {
    const issueRate = await getExchangeRate(orgId, d.currencyCode, base, d.issueDate);
    const currentRate = await getExchangeRate(orgId, d.currencyCode, base, asOfDate);
    if (issueRate == null || currentRate == null) continue;
    delta +=
      convertAmount(d.amountDue, currentRate) -
      convertAmount(d.amountDue, issueRate);
  }
  return delta;
}

export async function processFxRevaluationForOrg(
  orgId: string,
  asOfDate: string,
  reversalDate: string
): Promise<{ posted: boolean; reason?: string }> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
    columns: { defaultCurrency: true },
  });
  const base = org?.defaultCurrency ?? "USD";

  const openConditions = (table: typeof invoice | typeof bill) =>
    and(
      eq(table.organizationId, orgId),
      isNull(table.deletedAt),
      ne(table.status, "void"),
      ne(table.status, "paid"),
      ne(table.status, "draft"),
      ne(table.currencyCode, base)
    );

  const invoices = await db.query.invoice.findMany({ where: openConditions(invoice) });
  const bills = await db.query.bill.findMany({ where: openConditions(bill) });
  if (invoices.length === 0 && bills.length === 0) return { posted: false };

  const arDelta = await aggregateDelta(orgId, base, invoices, asOfDate);
  const apDelta = await aggregateDelta(orgId, base, bills, asOfDate);

  const arLegs = revaluationLegs("receivable", arDelta);
  const apLegs = revaluationLegs("payable", apDelta);
  if (arLegs.length === 0 && apLegs.length === 0) return { posted: false };

  const [arAccount, apAccount, gainAccount, lossAccount] = await Promise.all([
    findAccount(orgId, "1200"),
    findAccount(orgId, "2100"),
    ensureAccount(orgId, UNREALISED_GAIN, base),
    ensureAccount(orgId, UNREALISED_LOSS, base),
  ]);
  if (!arAccount || !apAccount || !gainAccount || !lossAccount) {
    return { posted: false, reason: "missing accounts" };
  }

  const accountIdFor = (role: SettlementLeg["role"], counterId: string) =>
    role === "counter"
      ? counterId
      : role === "fxGain"
      ? gainAccount.id
      : lossAccount.id;

  const buildLines = (
    entryId: string,
    legs: SettlementLeg[],
    counterId: string,
    desc: string
  ) =>
    legs.map((l) => ({
      journalEntryId: entryId,
      accountId: accountIdFor(l.role, counterId),
      description: desc,
      debitAmount: l.debit,
      creditAmount: l.credit,
      currencyCode: base,
    }));

  await postEntry(
    orgId,
    asOfDate,
    "fx_revaluation",
    `Unrealised FX revaluation ${asOfDate}`,
    (entryId, desc) => [
      ...buildLines(entryId, arLegs, arAccount.id, desc),
      ...buildLines(entryId, apLegs, apAccount.id, desc),
    ]
  );

  await postEntry(
    orgId,
    reversalDate,
    "fx_revaluation_reversal",
    `Reverse unrealised FX revaluation ${asOfDate}`,
    (entryId, desc) => [
      ...buildLines(entryId, reverseLegs(arLegs), arAccount.id, desc),
      ...buildLines(entryId, reverseLegs(apLegs), apAccount.id, desc),
    ]
  );

  return { posted: true };
}

async function postEntry(
  orgId: string,
  date: string,
  sourceType: string,
  description: string,
  lines: (entryId: string, desc: string) => (typeof journalLine.$inferInsert)[]
) {
  const entryNumber = await nextEntryNumber(orgId);
  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: orgId,
      entryNumber,
      date,
      description,
      reference: description,
      status: "posted",
      sourceType,
      postedAt: new Date(),
    })
    .returning();
  await db.insert(journalLine).values(lines(entry.id, description));
  return entry;
}

/** Revalue every organization. Intended to run from a scheduled job. */
export async function processFxRevaluation(
  asOfDate: string,
  reversalDate: string
): Promise<{ orgs: number; posted: number }> {
  const orgs = await db.select({ id: organization.id }).from(organization);
  let posted = 0;
  for (const o of orgs) {
    try {
      const res = await processFxRevaluationForOrg(o.id, asOfDate, reversalDate);
      if (res.posted) posted++;
    } catch (err) {
      console.error(`fx-revaluation failed for org ${o.id}`, err);
    }
  }
  return { orgs: orgs.length, posted };
}
