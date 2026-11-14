/**
 * Ledger primitives behind every tax return.
 *
 * Moved out of the old lib/reports/tax-return.ts (deleted) without changing the
 * logic, so the GB numbers are unchanged. Jurisdiction-specific knowledge — box
 * ids, labels, rate sets — lives in lib/tax/modules/*; nothing here knows about
 * a country.
 *
 * Conventions: integer minor units (cents); only `status = 'posted'`,
 * non-deleted, org-scoped entries count; accrual recognises on the entry date,
 * cash only on entries that moved cash (see cashEntryPredicate).
 */
import { db } from "@/lib/db";
import {
  chartAccount,
  journalEntry,
  journalLine,
  organization,
  invoice,
  invoiceLine,
  bill,
  billLine,
  contact,
  taxRate,
} from "@/lib/db/schema";
import { and, eq, gte, isNull, lte, sql, notInArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { CASH_SOURCE_TYPES } from "@/lib/reports/gl-query";
import type { SupplyCategory, TaxBasis } from "@/lib/tax/types";

export type { TaxBasis };

/** Org-level tax configuration that drives how a return is computed. */
export interface OrgTaxConfig {
  baseCurrency: string;
  vatScheme: TaxBasis;
  taxRegime: string | null;
  country: string | null;
}

export async function getOrgTaxConfig(organizationId: string): Promise<OrgTaxConfig> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: {
      defaultCurrency: true,
      vatScheme: true,
      taxRegime: true,
      countryCode: true,
      country: true,
    },
  });
  const scheme = org?.vatScheme === "cash" ? "cash" : "accrual";
  return {
    baseCurrency: org?.defaultCurrency ?? "USD",
    vatScheme: scheme,
    taxRegime: org?.taxRegime ?? null,
    country: org?.countryCode ?? org?.country ?? null,
  };
}

/** An explicit `?basis=` overrides the org default; anything unknown falls back. */
export function resolveBasis(
  requested: string | null | undefined,
  config: OrgTaxConfig
): TaxBasis {
  if (requested === "cash" || requested === "accrual") return requested;
  return config.vatScheme;
}

/** Resolve a control account's id by code (org-scoped, non-deleted). */
export async function getControlAccountId(
  organizationId: string,
  accountCode: string
): Promise<string | null> {
  const account = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, accountCode),
      isNull(chartAccount.deletedAt)
    ),
    columns: { id: true },
  });
  return account?.id ?? null;
}

/**
 * Cash-basis entry predicate (correlated to `journalEntry`): its sourceType is a
 * cash/payment source OR it has any line hitting a bank/cash account
 * (subType = 'bank'). Mirrors lib/reports/gl-query.ts.
 */
function cashEntryPredicate(): SQL {
  return sql`(
    ${journalEntry.sourceType} in (${sql.join(
      CASH_SOURCE_TYPES.map((s) => sql`${s}`),
      sql`, `
    )})
    or exists (
      select 1 from ${journalLine} cash_jl
      join ${chartAccount} cash_acct on cash_acct.id = cash_jl.account_id
      where cash_jl.journal_entry_id = ${journalEntry.id}
        and cash_acct.sub_type = 'bank'
    )
  )`;
}

/** Sum a control account's posted debit/credit movement over a period. */
export async function controlAccountMovement(
  organizationId: string,
  accountCode: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis = "accrual"
): Promise<{ debits: number; credits: number }> {
  const accountId = await getControlAccountId(organizationId, accountCode);
  if (!accountId) return { debits: 0, credits: 0 };

  const clauses: (SQL | undefined)[] = [
    eq(journalLine.accountId, accountId),
    eq(journalEntry.organizationId, organizationId),
    eq(journalEntry.status, "posted"),
    gte(journalEntry.date, startDate),
    lte(journalEntry.date, endDate),
    isNull(journalEntry.deletedAt),
  ];
  if (basis === "cash") clauses.push(cashEntryPredicate());

  const [row] = await db
    .select({
      debits: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.mapWith(Number),
      credits: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(and(...clauses));

  return { debits: row?.debits || 0, credits: row?.credits || 0 };
}

/**
 * Reverse-charge output VAT: credits on an output-VAT account belonging to
 * entries that also debit input VAT. That co-occurrence only happens when the
 * buyer self-accounts acquisition VAT, so it isolates it from ordinary output
 * tax. A fully blocked reverse charge (recoverablePercent = 0) posts no input
 * leg and is not captured — the SG module reads reverse charge from bill lines
 * instead.
 */
export async function reverseChargeVat(
  organizationId: string,
  outputAccount: string,
  inputAccount: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const outputVatAccountId = await getControlAccountId(organizationId, outputAccount);
  const inputVatAccountId = await getControlAccountId(organizationId, inputAccount);
  if (!outputVatAccountId || !inputVatAccountId) return 0;

  const [row] = await db
    .select({
      credits: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.mapWith(Number),
      debits: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalLine.accountId, outputVatAccountId),
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        gte(journalEntry.date, startDate),
        lte(journalEntry.date, endDate),
        isNull(journalEntry.deletedAt),
        sql`exists (
          select 1 from ${journalLine} rc_input
          where rc_input.journal_entry_id = ${journalEntry.id}
            and rc_input.account_id = ${inputVatAccountId}
            and rc_input.debit_amount > 0
        )`
      )
    );
  return (row?.credits || 0) - (row?.debits || 0);
}

/**
 * Cross-border B2B figures (EU boxes 8/9 and AU G2): a counterparty with a tax
 * number whose billing country differs from ours. Document subtotals.
 */
export async function computeEcSales(
  organizationId: string,
  startDate: string,
  endDate: string,
  orgCountry: string | null
): Promise<{ ecSalesNet: number; ecAcquisitionsNet: number }> {
  const billingCountry = sql<string>`(${contact.addresses} #>> '{billing,country}')`;
  const crossBorder = orgCountry
    ? sql`${billingCountry} is not null and ${billingCountry} <> '' and ${billingCountry} <> ${orgCountry}`
    : sql`${billingCountry} is not null and ${billingCountry} <> ''`;
  const vatRegistered = sql`${contact.taxNumber} is not null and ${contact.taxNumber} <> ''`;

  const [sales] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoice.subtotal}), 0)`.mapWith(Number) })
    .from(invoice)
    .innerJoin(contact, eq(invoice.contactId, contact.id))
    .where(
      and(
        eq(invoice.organizationId, organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt),
        vatRegistered,
        crossBorder
      )
    );

  const [acqs] = await db
    .select({ total: sql<number>`COALESCE(SUM(${bill.subtotal}), 0)`.mapWith(Number) })
    .from(bill)
    .innerJoin(contact, eq(bill.contactId, contact.id))
    .where(
      and(
        eq(bill.organizationId, organizationId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt),
        vatRegistered,
        crossBorder
      )
    );

  return {
    ecSalesNet: sales?.total || 0,
    ecAcquisitionsNet: acqs?.total || 0,
  };
}

/** Document header total (invoice/bill subtotal ex-tax, or total incl. tax). */
export async function docTotal(
  organizationId: string,
  doc: "invoice" | "bill",
  measure: "net" | "gross",
  startDate: string,
  endDate: string
): Promise<number> {
  const table = doc === "invoice" ? invoice : bill;
  const column = measure === "net" ? table.subtotal : table.total;
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${column}), 0)`.mapWith(Number) })
    .from(table)
    .where(
      and(
        eq(table.organizationId, organizationId),
        gte(table.issueDate, startDate),
        lte(table.issueDate, endDate),
        notInArray(table.status, ["draft", "void"]),
        isNull(table.deletedAt)
      )
    );
  return row?.total || 0;
}

/**
 * Supply category of a document line, resolved from its tax rate.
 *
 * `supply_category` is authoritative when set. Rows created before the column
 * existed fall back to `kind`, and a 0% rate named "…zero…" counts as zero-rated
 * — the backfill left those NULL on purpose so EU behaviour cannot change.
 */
const supplyCategorySql = sql<string>`case
  when ${taxRate.supplyCategory} is not null then ${taxRate.supplyCategory}::text
  when ${taxRate.kind} = 'exempt' then 'exempt'
  when ${taxRate.kind} = 'no_vat' then 'outside_scope'
  when ${taxRate.rate} = 0 and ${taxRate.name} ilike '%zero%' then 'zero_rated'
  else 'standard'
end`;

/**
 * Net / tax / gross totals of document lines in a period, grouped by supply
 * category. Lines with no tax rate count as standard (they carry no tax).
 */
export async function docLineTotals(
  organizationId: string,
  doc: "invoiceLine" | "billLine",
  measure: "net" | "tax" | "gross",
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  // The two line tables are separate Drizzle types, so the query is written
  // twice rather than cast — a cast here would hide the next schema change.
  const rows =
    doc === "invoiceLine"
      ? await lineTotalsQuery(invoiceLine, invoice, invoiceLine.invoiceId, invoiceLine.amount, invoiceLine.taxAmount, measure, organizationId, startDate, endDate)
      : await lineTotalsQuery(billLine, bill, billLine.billId, billLine.amount, billLine.taxAmount, measure, organizationId, startDate, endDate);

  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = r.total;
  return out;
}

interface LineShape {
  amount: PgColumn;
  taxAmount: PgColumn;
  taxRateId: PgColumn;
}

async function lineTotalsQuery(
  line: LineShape,
  header: typeof invoice | typeof bill,
  lineForeignKey: PgColumn,
  amountColumn: PgColumn,
  taxColumn: PgColumn,
  measure: "net" | "tax" | "gross",
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<{ category: string; total: number }[]> {
  const amount =
    measure === "net"
      ? sql<number>`${amountColumn}`
      : measure === "tax"
        ? sql<number>`${taxColumn}`
        : sql<number>`${amountColumn} + ${taxColumn}`;

  return db
    .select({
      category: supplyCategorySql,
      total: sql<number>`COALESCE(SUM(${amount}), 0)`.mapWith(Number),
    })
    .from(line as never)
    .innerJoin(header, eq(lineForeignKey, header.id))
    .leftJoin(taxRate, eq(line.taxRateId, taxRate.id))
    .where(
      and(
        eq(header.organizationId, organizationId),
        gte(header.issueDate, startDate),
        lte(header.issueDate, endDate),
        notInArray(header.status, ["draft", "void"]),
        isNull(header.deletedAt)
      )
    )
    .groupBy(supplyCategorySql);
}

/**
 * Posted movement on all accounts of an account type (revenue for F5 box 13).
 *
 * `disallowedWeighted` returns only the portion each account marks as
 * non-deductible for income tax (chartAccount.taxDisallowedPercent) — that is the
 * add-back line on a Singapore tax computation.
 */
export async function accountTypeBalance(
  organizationId: string,
  type: "revenue" | "expense" | "asset" | "liability" | "equity",
  sign: "credit" | "debit",
  startDate: string,
  endDate: string,
  disallowedWeighted = false
): Promise<number> {
  const rows = await db
    .select({
      accountId: chartAccount.id,
      disallowedPercent: chartAccount.taxDisallowedPercent,
      debits: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.mapWith(Number),
      credits: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        eq(chartAccount.type, type),
        gte(journalEntry.date, startDate),
        lte(journalEntry.date, endDate),
        isNull(journalEntry.deletedAt)
      )
    )
    .groupBy(chartAccount.id, chartAccount.taxDisallowedPercent);

  let total = 0;
  for (const r of rows) {
    const gross = sign === "credit" ? r.credits - r.debits : r.debits - r.credits;
    total += disallowedWeighted
      ? Math.round((gross * (r.disallowedPercent ?? 0)) / 10000)
      : gross;
  }
  return total;
}

/**
 * Balance of every account carrying a chartAccount.subType (Form C-S
 * particulars: directors' fees, medical, transport, entertainment, …).
 * `disallowedWeighted` applies each account's taxDisallowedPercent, giving the
 * income-tax add-back for a non-deductible expense.
 */
export async function accountTagBalance(
  organizationId: string,
  subType: string,
  sign: "credit" | "debit",
  startDate: string,
  endDate: string,
  disallowedWeighted = false
): Promise<number> {
  const rows = await db
    .select({
      accountId: chartAccount.id,
      disallowedPercent: chartAccount.taxDisallowedPercent,
      debits: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.mapWith(Number),
      credits: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        eq(chartAccount.subType, subType),
        gte(journalEntry.date, startDate),
        lte(journalEntry.date, endDate),
        isNull(journalEntry.deletedAt)
      )
    )
    .groupBy(chartAccount.id, chartAccount.taxDisallowedPercent);

  let total = 0;
  for (const r of rows) {
    const gross = sign === "credit" ? r.credits - r.debits : r.debits - r.credits;
    total += disallowedWeighted
      ? Math.round((gross * (r.disallowedPercent ?? 0)) / 10000)
      : gross;
  }
  return total;
}

/** A single underlying journal line for box drill-down. */
export interface BoxTransaction {
  journalLineId: string;
  journalEntryId: string;
  entryNumber: number;
  date: string;
  description: string | null;
  reference: string | null;
  sourceType: string | null;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  amount: number;
}

/**
 * Underlying posted journal lines on a control account for a period, with each
 * line's contribution on the box's natural sign (sum = the box figure).
 */
export async function accountTransactions(
  organizationId: string,
  accountCode: string,
  sign: "credit" | "debit",
  startDate: string,
  endDate: string,
  basis: TaxBasis = "accrual"
): Promise<BoxTransaction[]> {
  const accountId = await getControlAccountId(organizationId, accountCode);
  if (!accountId) return [];

  const clauses: (SQL | undefined)[] = [
    eq(journalLine.accountId, accountId),
    eq(journalEntry.organizationId, organizationId),
    eq(journalEntry.status, "posted"),
    gte(journalEntry.date, startDate),
    lte(journalEntry.date, endDate),
    isNull(journalEntry.deletedAt),
  ];
  if (basis === "cash") clauses.push(cashEntryPredicate());

  const rows = await db
    .select({
      journalLineId: journalLine.id,
      journalEntryId: journalEntry.id,
      entryNumber: journalEntry.entryNumber,
      date: journalEntry.date,
      description: journalLine.description,
      entryDescription: journalEntry.description,
      reference: journalEntry.reference,
      sourceType: journalEntry.sourceType,
      accountCode: chartAccount.code,
      accountName: chartAccount.name,
      debit: journalLine.debitAmount,
      credit: journalLine.creditAmount,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(and(...clauses))
    .orderBy(journalEntry.date, journalEntry.entryNumber);

  return rows.map((r) => {
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    return {
      journalLineId: r.journalLineId,
      journalEntryId: r.journalEntryId,
      entryNumber: r.entryNumber,
      date: r.date,
      description: r.description ?? r.entryDescription,
      reference: r.reference,
      sourceType: r.sourceType,
      accountCode: r.accountCode,
      accountName: r.accountName,
      debit,
      credit,
      amount: sign === "credit" ? credit - debit : debit - credit,
    };
  });
}

/**
 * Reverse-charge tax on bill lines (Singapore box 14 / 16 / 17 source). Reads the
 * document, not the ledger, because a fully blocked reverse charge
 * (recoverablePercent = 0) posts no input leg and the ledger heuristic misses it.
 */
export async function reverseChargeFromDocs(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${billLine.taxAmount}), 0)`.mapWith(Number) })
    .from(billLine)
    .innerJoin(bill, eq(billLine.billId, bill.id))
    .innerJoin(taxRate, eq(billLine.taxRateId, taxRate.id))
    .where(
      and(
        eq(bill.organizationId, organizationId),
        eq(taxRate.kind, "reverse_charge"),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      )
    );
  return row?.total || 0;
}
