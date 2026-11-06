import { db } from "@/lib/db";
import {
  chartAccount,
  deductionType,
  journalEntry,
  journalLine,
  organization,
  payrollItem,
  payrollItemDeduction,
  payrollItemEmployerTax,
  payrollItemTaxBreakdown,
  payrollRun,
  payrollSettings,
  payrollTaxPayment,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * The liability buckets a payroll run credits and a tax payment clears (see
 * lib/api/payroll-posting.ts): income tax withheld → 2220 (or the income-tax
 * account set in payroll settings), Social Security / Medicare / FUTA / SUTA,
 * employee and employer side → 2235, pension & benefit deductions → 2245.
 */
export const LIABILITY_BUCKETS = [
  { bucket: "income_tax", defaultCode: "2220" },
  { bucket: "fica", defaultCode: "2235" },
  { bucket: "pension", defaultCode: "2245" },
] as const;

export type LiabilityBucket = (typeof LIABILITY_BUCKETS)[number]["bucket"];

/**
 * The income-tax payable account: the payroll-settings account, unless it is
 * the legacy 2200 (VAT) default, which payroll never posts to.
 */
export function incomeTaxAccountCode(configured: string | null | undefined): string {
  return configured && configured !== "2200" ? configured : "2220";
}

/** Account code for each bucket in this org. */
export async function liabilityAccountCodes(organizationId: string): Promise<Record<LiabilityBucket, string>> {
  const settings = await db.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, organizationId),
  });
  return {
    income_tax: incomeTaxAccountCode(settings?.taxPayableAccountCode),
    fica: "2235",
    pension: "2245",
  };
}

export interface LiabilityBucketTotals {
  bucket: LiabilityBucket;
  accountCode: string;
  /** Credited to the account by completed pay runs, base-currency cents. */
  owed: number;
  /** Debited to the account by recorded tax payments, base-currency cents. */
  paid: number;
  /** owed − paid, never below zero. */
  outstanding: number;
}

/** Bucket of a withholding or employer tax line (mirrors payroll-posting). */
function taxBucket(taxKind: string): LiabilityBucket {
  return /social_security|social security|medicare|fica|nic|national insurance|unemployment|futa|suta/i.test(taxKind)
    ? "fica"
    : "income_tax";
}

/** Pension & benefit deductions go to 2245; other deductions (2236) aren't tracked here. */
function isPensionOrBenefit(name: string, category: string) {
  return category === "pre_tax" || /pension|401|retire|benefit|health|hsa|medical|insurance|dental|vision/i.test(name);
}

/**
 * Per-bucket amounts of finished runs that have no journal entry (e.g. imported
 * or seeded runs), worked out from their stored breakdown rows the same way
 * posting would bucket them, converted at each item's fxRate. Items with no
 * tax breakdown rows count their whole taxAmount as income tax.
 */
async function unpostedRunBuckets(ctx: AuthContext): Promise<Record<LiabilityBucket, number>> {
  const totals: Record<LiabilityBucket, number> = { income_tax: 0, fica: 0, pension: 0 };
  const items = await db
    .select({ id: payrollItem.id, taxAmount: payrollItem.taxAmount, fxRate: payrollItem.fxRate })
    .from(payrollItem)
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(and(
      eq(payrollRun.organizationId, ctx.organizationId),
      eq(payrollRun.status, "completed"),
      notDeleted(payrollRun.deletedAt),
      isNull(payrollRun.journalEntryId)
    ));
  if (items.length === 0) return totals;

  const ids = items.map((i) => i.id);
  const rate = new Map(items.map((i) => [i.id, i.fxRate ?? 1]));
  const toBase = (itemId: string, amount: number) => Math.round(amount * (rate.get(itemId) ?? 1));

  const taxRows = await db.select().from(payrollItemTaxBreakdown).where(inArray(payrollItemTaxBreakdown.payrollItemId, ids));
  const employerRows = await db.select().from(payrollItemEmployerTax).where(inArray(payrollItemEmployerTax.payrollItemId, ids));
  const deductionRows = await db
    .select({
      payrollItemId: payrollItemDeduction.payrollItemId,
      amount: payrollItemDeduction.amount,
      category: payrollItemDeduction.category,
      name: deductionType.name,
    })
    .from(payrollItemDeduction)
    .innerJoin(deductionType, eq(payrollItemDeduction.deductionTypeId, deductionType.id))
    .where(inArray(payrollItemDeduction.payrollItemId, ids));

  const itemsWithTaxRows = new Set(taxRows.map((t) => t.payrollItemId));
  for (const t of taxRows) totals[taxBucket(t.taxKind)] += toBase(t.payrollItemId, t.amount);
  for (const t of employerRows) totals[taxBucket(t.taxKind)] += toBase(t.payrollItemId, t.amount);
  for (const d of deductionRows) {
    if (isPensionOrBenefit(d.name, d.category)) totals.pension += toBase(d.payrollItemId, d.amount);
  }
  for (const it of items) {
    if (!itemsWithTaxRows.has(it.id)) totals.income_tax += toBase(it.id, it.taxAmount);
  }
  return totals;
}

/**
 * What finished pay runs put into each payroll liability account and what tax
 * payments took out, read from the posted journal lines so both sides are in
 * the same base currency and buckets. Finished runs without a journal entry are
 * added from their breakdown rows. Void runs (their entry is reversed) and
 * deleted runs or payments are left out.
 */
export async function getPayrollTaxLiabilities(ctx: AuthContext) {
  const codes = await liabilityAccountCodes(ctx.organizationId);
  const codeList = [...new Set(Object.values(codes))];

  const live = and(eq(journalEntry.status, "posted"), isNull(journalEntry.reversedByEntryId));

  const credited = await db
    .select({
      code: chartAccount.code,
      amount: sql<number>`coalesce(sum(${journalLine.creditAmount} - ${journalLine.debitAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(payrollRun, eq(payrollRun.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(and(
      eq(payrollRun.organizationId, ctx.organizationId),
      eq(payrollRun.status, "completed"),
      notDeleted(payrollRun.deletedAt),
      live,
      inArray(chartAccount.code, codeList)
    ))
    .groupBy(chartAccount.code);

  const debited = await db
    .select({
      code: chartAccount.code,
      amount: sql<number>`coalesce(sum(${journalLine.debitAmount} - ${journalLine.creditAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(payrollTaxPayment, eq(payrollTaxPayment.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(and(
      eq(payrollTaxPayment.organizationId, ctx.organizationId),
      notDeleted(payrollTaxPayment.deletedAt),
      live,
      inArray(chartAccount.code, codeList)
    ))
    .groupBy(chartAccount.code);

  const owedByCode = new Map(credited.map((r) => [r.code, r.amount]));
  const paidByCode = new Map(debited.map((r) => [r.code, r.amount]));
  const unposted = await unpostedRunBuckets(ctx);

  const buckets: LiabilityBucketTotals[] = LIABILITY_BUCKETS.map(({ bucket }) => {
    const accountCode = codes[bucket];
    const owed = (owedByCode.get(accountCode) ?? 0) + unposted[bucket];
    const paid = paidByCode.get(accountCode) ?? 0;
    return { bucket, accountCode, owed, paid, outstanding: Math.max(0, owed - paid) };
  });

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, ctx.organizationId),
    columns: { defaultCurrency: true },
  });

  return {
    currency: org?.defaultCurrency ?? "USD",
    buckets,
    owed: buckets.reduce((s, b) => s + b.owed, 0),
    paid: buckets.reduce((s, b) => s + b.paid, 0),
    outstanding: buckets.reduce((s, b) => s + b.outstanding, 0),
  };
}
