/**
 * Shared VAT / GST return computation.
 *
 * Centralises the logic behind the VAT-return, BAS, drill-down and filing
 * routes so accrual vs. cash basis, EC-sales boxes and flat-rate handling stay
 * consistent across all of them.
 *
 * Conventions (see CLAUDE.md):
 * - All monetary amounts are integer minor units (cents).
 * - Only `status = 'posted'` (and non-deleted) entries count toward a return.
 * - Every query is org-scoped.
 *
 * Recognition basis:
 *   accrual (default) — VAT is recognised on the document/posting date (the
 *     journal entry date), capturing every posting source on the control
 *     accounts (2200 output, 1500 input).
 *   cash — VAT is recognised in the period a payment actually cleared. We reuse
 *     the documented cash-basis heuristic from lib/reports/gl-query.ts: an entry
 *     counts on the cash basis when EITHER its sourceType is a cash/payment
 *     source OR it touches a bank/cash chart account (subType = 'bank'). This
 *     keeps the computation a single SQL pass while matching how cash actually
 *     moves through the books (payments + bank-feed categorisations).
 */
import { db } from "@/lib/db";
import {
  chartAccount,
  journalEntry,
  journalLine,
  organization,
  invoice,
  bill,
  contact,
} from "@/lib/db/schema";
import { and, eq, gte, isNull, lte, sql, notInArray, type SQL } from "drizzle-orm";
import { CASH_SOURCE_TYPES } from "@/lib/reports/gl-query";

export type TaxBasis = "accrual" | "cash";

/** Org-level tax configuration that drives how a return is computed. */
export interface OrgTaxConfig {
  baseCurrency: string;
  /** 'accrual' (default) | 'cash'. */
  vatScheme: TaxBasis;
  /** 'vat' | 'gst' | 'us_sales_tax' | 'none' | null (unset). */
  taxRegime: string | null;
  /** ISO country (countryCode preferred, falling back to `country`). */
  country: string | null;
}

/**
 * Read the org's tax configuration. `vatScheme`/`taxRegime`/`countryCode` are
 * existing columns on `organization` (see lib/db/schema/auth.ts); we normalise
 * vatScheme to a known basis and default to accrual.
 */
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

/**
 * Resolve the basis to use for a request: an explicit `?basis=` query param
 * overrides the org default, otherwise the org's vatScheme is used. Anything
 * other than the two known values falls back to the org default.
 */
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
 * Build the cash-basis entry predicate (correlated to `journalEntry`): keep the
 * entry when its sourceType is a cash/payment source OR it has any line hitting
 * a bank/cash account (subType = 'bank'). Mirrors lib/reports/gl-query.ts so the
 * tax return and the financial statements agree on what "cash" means.
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

/**
 * Sum a ledger control account's posted debit/credit movement over a period.
 *
 * On the accrual basis this captures every posting source on the account
 * (invoices, bills, bank categorisations, manual journals, credit/debit notes,
 * corrections). On the cash basis only entries that moved cash in the period are
 * counted (see cashEntryPredicate). Degrades to {0,0} when the org has no
 * control account with that code.
 *
 * Returns `credits - debits` natural sign for a liability/output account; negate
 * for a debit-natural (input) account.
 */
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
 * Intra-community (EC) supplies/acquisitions, derived from the data that does
 * exist: a counterparty `contact` with a `taxNumber` (VAT-registered) whose
 * billing country differs from the org's own country (cross-border within the
 * EU). We cannot positively identify "EU member state" without a country→EU
 * lookup table (no such column/table this round — see gap note), so this is a
 * best-effort "cross-border B2B to a VAT-registered counterparty" figure that
 * populates boxes 8/9 (and 2) instead of hardcoding 0.
 *
 *   ecSalesNet        → box 8 (supplies to EU, ex-VAT) from invoices
 *   ecAcquisitionsNet → box 9 (acquisitions from EU, ex-VAT) from bills
 *
 * Amounts are document-currency subtotals (consistent with boxes 6/7, which are
 * also document subtotals in the current routes). Returns {0,0} when no
 * qualifying documents exist.
 */
export async function computeEcSales(
  organizationId: string,
  startDate: string,
  endDate: string,
  orgCountry: string | null
): Promise<{ ecSalesNet: number; ecAcquisitionsNet: number }> {
  // A counterparty is treated as cross-border when it is VAT-registered
  // (taxNumber present) AND its billing country is set and differs from ours.
  // When the org has no country on file we fall back to "any VAT-registered
  // counterparty with a billing country", which still beats a hardcoded 0.
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
  /** Signed contribution to the box on its natural sign (see box mapping). */
  amount: number;
}

/** Box → control-account code + natural sign for drill-down. */
const BOX_ACCOUNT: Record<string, { code: string; sign: "credit" | "debit" }> = {
  // VAT boxes
  "1": { code: "2200", sign: "credit" }, // output VAT due on sales
  "4": { code: "1500", sign: "debit" }, // input VAT reclaimed on purchases
  // BAS fields
  "1A": { code: "2200", sign: "credit" }, // GST on sales
  "1B": { code: "1500", sign: "debit" }, // GST on purchases
};

/** Which boxes support a journal-line drill-down. */
export function isDrillableBox(box: string): boolean {
  return box in BOX_ACCOUNT;
}

/**
 * Return the underlying posted journal lines that make up a VAT/BAS box for the
 * period — the 2200 (output) or 1500 (input) control-account lines, with each
 * line's entry and account context, respecting the recognition basis.
 *
 * `amount` is the line's contribution on the box's natural sign: for output
 * boxes (credit-normal) it is credit − debit; for input boxes (debit-normal) it
 * is debit − credit. The sum of `amount` equals the box figure.
 */
export async function boxTransactions(
  organizationId: string,
  box: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis = "accrual"
): Promise<BoxTransaction[]> {
  const mapping = BOX_ACCOUNT[box];
  if (!mapping) return [];
  const accountId = await getControlAccountId(organizationId, mapping.code);
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
    const amount = mapping.sign === "credit" ? credit - debit : debit - credit;
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
      amount,
    };
  });
}
