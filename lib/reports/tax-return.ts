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
 *   cash — VAT is recognised in the period it is paid. Entries that move cash
 *     themselves (bank-feed categorisations, sales receipts, anything touching a
 *     bank account) count on their own date; invoices, bills and credit notes
 *     count pro rata to their settlements, on the settlement date (see
 *     lib/reports/cash-basis.ts). The VAT stays in the 2200 / 1500 control
 *     accounts until it is paid and filed, so the filing clears only the
 *     realised part and the unpaid remainder carries forward.
 *
 * VAT-return clearing entries (sourceType 'vat_return') are never part of a
 * return: they are dated on the period end and would otherwise zero Box 1 and
 * Box 4 when a filed period is viewed again.
 */
import { accountCodeMatch } from "@/lib/api/account-roles";
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
  creditNote,
  creditNoteLine,
  debitNote,
  debitNoteLine,
  salesReceipt,
  salesReceiptLine,
  contact,
} from "@/lib/db/schema";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { and, eq, gte, inArray, isNull, lte, sql, notInArray, type SQL } from "drizzle-orm";
import { CASH_SOURCE_TYPES, realisedFraction } from "@/lib/reports/cash-basis";
import { loadCashRealisedLines, loadSettledDocuments } from "@/lib/reports/cash-basis-ledger";
import {
  basFields,
  documentFigures,
  vatReturnBoxes,
  vatTotals,
  type DocumentFigures,
  type ReturnBox,
  type TaxDocument,
  type VatLine,
  type VatTotals,
} from "@/lib/reports/vat-figures";

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
      accountCodeMatch(accountCode),
      isNull(chartAccount.deletedAt)
    ),
    columns: { id: true },
  });
  return account?.id ?? null;
}

/**
 * The accounts that hold tax collected on sales: Output VAT / GST (2200) and,
 * for US sales tax, Sales Tax Payable (2230). On some charts both codes map to
 * one account; the list has no duplicates.
 */
export async function getOutputControlAccountIds(organizationId: string): Promise<string[]> {
  const ids = await Promise.all([
    getControlAccountId(organizationId, "2200"),
    getControlAccountId(organizationId, "2230"),
  ]);
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
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

/** Leave the VAT-return clearing entries out of every return figure. */
function notVatReturnClearing(): SQL {
  return sql`coalesce(${journalEntry.sourceType}, '') <> 'vat_return'`;
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
    notVatReturnClearing(),
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

  let debits = row?.debits || 0;
  let credits = row?.credits || 0;
  if (basis === "cash") {
    // Plus the VAT on invoices / bills / credit notes settled in the period.
    for (const l of await loadCashRealisedLines(organizationId, { startDate, endDate }, { accountIds: [accountId] })) {
      debits += l.debit;
      credits += l.credit;
    }
  }
  return { debits, credits };
}

/** A counterparty is cross-border when VAT-registered and billed from another country. */
function crossBorderSql(orgCountry: string | null): SQL<boolean> {
  // We can't positively identify "EU member state" without a country list, so
  // this is "cross-border B2B with a VAT-registered counterparty". When the org
  // has no country on file, any VAT-registered counterparty with a billing
  // country counts.
  const billingCountry = sql<string>`(${contact.addresses} #>> '{billing,country}')`;
  const crossBorder = orgCountry
    ? sql`${billingCountry} is not null and ${billingCountry} <> '' and ${billingCountry} <> ${orgCountry}`
    : sql`${billingCountry} is not null and ${billingCountry} <> ''`;
  return sql<boolean>`coalesce((${contact.taxNumber} is not null and ${contact.taxNumber} <> '' and ${crossBorder}), false)`;
}

/** The document's posting rate (document → base, x1,000,000) from its journal lines. */
function entryRateSql(journalEntryId: SQL | AnyPgColumn): SQL<number> {
  return sql<number>`coalesce((select max(rate_jl.exchange_rate) from ${journalLine} rate_jl where rate_jl.journal_entry_id = ${journalEntryId}), 1000000)`;
}

/**
 * Load the sales and purchase documents behind the turnover boxes (VAT boxes
 * 6 to 9, BAS G fields) with their share of the period:
 *   accrual: invoices, credit notes, bills and debit notes issued in the
 *            period, and sales receipts dated in it (weight 1);
 *   cash:    invoices, bills, credit notes and debit notes weighted by the
 *            share settled in the period (a credit or debit note settles when
 *            it is applied to an invoice or bill), plus sales receipts dated
 *            in it.
 * Credit and debit notes count negative. Amounts convert to the base currency
 * at each document's posting rate.
 */
export async function loadTaxDocuments(
  organizationId: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis,
  orgCountry: string | null
): Promise<TaxDocument[]> {
  const crossBorder = crossBorderSql(orgCountry);

  // Cash basis: realised share per document (keyed "type:id").
  let weights: Map<string, number> | null = null;
  if (basis === "cash") {
    const settled = await loadSettledDocuments(organizationId, { startDate, endDate });
    weights = new Map(
      settled.map((d) => [
        `${d.documentType}:${d.documentId}`,
        realisedFraction(d.total, d.settlements, startDate, endDate),
      ])
    );
  }
  const idsFor = (type: string) =>
    weights ? [...weights.keys()].filter((k) => k.startsWith(`${type}:`)).map((k) => k.slice(type.length + 1)) : null;
  const weightFor = (type: string, id: string) => (weights ? weights.get(`${type}:${id}`) ?? 0 : 1);

  type Header = { id: string; subtotal: number; total: number; rate: number; crossBorder: boolean };
  type Line = { docId: string; amount: number; taxAmount: number; capital: boolean };
  const docs: TaxDocument[] = [];
  const push = (
    type: string,
    side: TaxDocument["side"],
    sign: TaxDocument["sign"],
    headers: Header[],
    lines: Line[],
    weightOverride?: number
  ) => {
    const byDoc = new Map<string, Line[]>();
    for (const l of lines) byDoc.set(l.docId, [...(byDoc.get(l.docId) ?? []), l]);
    for (const h of headers) {
      docs.push({
        side,
        sign,
        weight: weightOverride ?? weightFor(type, h.id),
        rate: Number(h.rate),
        subtotal: Number(h.subtotal),
        total: Number(h.total),
        crossBorder: Boolean(h.crossBorder),
        lines: (byDoc.get(h.id) ?? []).map((l) => ({
          amount: Number(l.amount),
          taxAmount: Number(l.taxAmount),
          capital: Boolean(l.capital),
        })),
      });
    }
  };
  const capitalSql = sql<boolean>`coalesce(${chartAccount.type} = 'asset' and ${chartAccount.subType} = 'fixed', false)`;

  // Invoices
  const invoiceIds = idsFor("invoice");
  if (!invoiceIds || invoiceIds.length > 0) {
    const headers = await db
      .select({ id: invoice.id, subtotal: invoice.subtotal, total: invoice.total, rate: entryRateSql(invoice.journalEntryId), crossBorder })
      .from(invoice)
      .innerJoin(contact, eq(invoice.contactId, contact.id))
      .where(
        and(
          eq(invoice.organizationId, organizationId),
          notInArray(invoice.status, ["draft", "void", "pending_approval", "rejected"]),
          isNull(invoice.deletedAt),
          invoiceIds ? inArray(invoice.id, invoiceIds) : and(gte(invoice.issueDate, startDate), lte(invoice.issueDate, endDate))
        )
      );
    const lines = headers.length
      ? await db
          .select({ docId: invoiceLine.invoiceId, amount: invoiceLine.amount, taxAmount: invoiceLine.taxAmount, capital: sql<boolean>`false` })
          .from(invoiceLine)
          .where(inArray(invoiceLine.invoiceId, headers.map((h) => h.id)))
      : [];
    push("invoice", "sale", 1, headers, lines);
  }

  // Credit notes
  const creditNoteIds = idsFor("credit_note");
  if (!creditNoteIds || creditNoteIds.length > 0) {
    const headers = await db
      .select({ id: creditNote.id, subtotal: creditNote.subtotal, total: creditNote.total, rate: entryRateSql(creditNote.journalEntryId), crossBorder })
      .from(creditNote)
      .innerJoin(contact, eq(creditNote.contactId, contact.id))
      .where(
        and(
          eq(creditNote.organizationId, organizationId),
          notInArray(creditNote.status, ["draft", "void"]),
          isNull(creditNote.deletedAt),
          creditNoteIds ? inArray(creditNote.id, creditNoteIds) : and(gte(creditNote.issueDate, startDate), lte(creditNote.issueDate, endDate))
        )
      );
    const lines = headers.length
      ? await db
          .select({ docId: creditNoteLine.creditNoteId, amount: creditNoteLine.amount, taxAmount: creditNoteLine.taxAmount, capital: sql<boolean>`false` })
          .from(creditNoteLine)
          .where(inArray(creditNoteLine.creditNoteId, headers.map((h) => h.id)))
      : [];
    push("credit_note", "sale", -1, headers, lines);
  }

  // Sales receipts (cash sales): on their date under both bases.
  {
    const headers = await db
      .select({ id: salesReceipt.id, subtotal: salesReceipt.subtotal, total: salesReceipt.total, rate: entryRateSql(salesReceipt.journalEntryId), crossBorder })
      .from(salesReceipt)
      .leftJoin(contact, eq(salesReceipt.contactId, contact.id))
      .where(
        and(
          eq(salesReceipt.organizationId, organizationId),
          eq(salesReceipt.status, "paid"),
          isNull(salesReceipt.deletedAt),
          gte(salesReceipt.date, startDate),
          lte(salesReceipt.date, endDate)
        )
      );
    const lines = headers.length
      ? await db
          .select({ docId: salesReceiptLine.salesReceiptId, amount: salesReceiptLine.amount, taxAmount: salesReceiptLine.taxAmount, capital: sql<boolean>`false` })
          .from(salesReceiptLine)
          .where(inArray(salesReceiptLine.salesReceiptId, headers.map((h) => h.id)))
      : [];
    push("sales_receipt", "sale", 1, headers, lines, 1);
  }

  // Bills
  const billIds = idsFor("bill");
  if (!billIds || billIds.length > 0) {
    const headers = await db
      .select({ id: bill.id, subtotal: bill.subtotal, total: bill.total, rate: entryRateSql(bill.journalEntryId), crossBorder })
      .from(bill)
      .innerJoin(contact, eq(bill.contactId, contact.id))
      .where(
        and(
          eq(bill.organizationId, organizationId),
          notInArray(bill.status, ["draft", "void", "pending_approval"]),
          isNull(bill.deletedAt),
          billIds ? inArray(bill.id, billIds) : and(gte(bill.issueDate, startDate), lte(bill.issueDate, endDate))
        )
      );
    const lines = headers.length
      ? await db
          .select({ docId: billLine.billId, amount: billLine.amount, taxAmount: billLine.taxAmount, capital: capitalSql })
          .from(billLine)
          .leftJoin(chartAccount, eq(billLine.accountId, chartAccount.id))
          .where(inArray(billLine.billId, headers.map((h) => h.id)))
      : [];
    push("bill", "purchase", 1, headers, lines);
  }

  // Debit notes
  const debitNoteIds = idsFor("debit_note");
  if (!debitNoteIds || debitNoteIds.length > 0) {
    const headers = await db
      .select({ id: debitNote.id, subtotal: debitNote.subtotal, total: debitNote.total, rate: entryRateSql(debitNote.journalEntryId), crossBorder })
      .from(debitNote)
      .innerJoin(contact, eq(debitNote.contactId, contact.id))
      .where(
        and(
          eq(debitNote.organizationId, organizationId),
          notInArray(debitNote.status, ["draft", "void"]),
          isNull(debitNote.deletedAt),
          debitNoteIds ? inArray(debitNote.id, debitNoteIds) : and(gte(debitNote.issueDate, startDate), lte(debitNote.issueDate, endDate))
        )
      );
    const lines = headers.length
      ? await db
          .select({ docId: debitNoteLine.debitNoteId, amount: debitNoteLine.amount, taxAmount: debitNoteLine.taxAmount, capital: capitalSql })
          .from(debitNoteLine)
          .leftJoin(chartAccount, eq(debitNoteLine.accountId, chartAccount.id))
          .where(inArray(debitNoteLine.debitNoteId, headers.map((h) => h.id)))
      : [];
    push("debit_note", "purchase", -1, headers, lines);
  }

  return docs;
}

/**
 * The output (2200) and input (1500) VAT lines for the period on the chosen
 * basis, keyed by entry (or realised slice) so reverse-charge VAT can be told
 * apart from sales VAT.
 */
export async function loadVatLines(
  organizationId: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis
): Promise<VatLine[]> {
  const [outputIds, inputId] = await Promise.all([
    getOutputControlAccountIds(organizationId),
    getControlAccountId(organizationId, "1500"),
  ]);
  const ids = [...outputIds, ...(inputId && !outputIds.includes(inputId) ? [inputId] : [])];
  if (ids.length === 0) return [];
  const accountOf = (id: string): VatLine["account"] => (id === inputId ? "input" : "output");

  const clauses: (SQL | undefined)[] = [
    inArray(journalLine.accountId, ids),
    eq(journalEntry.organizationId, organizationId),
    eq(journalEntry.status, "posted"),
    gte(journalEntry.date, startDate),
    lte(journalEntry.date, endDate),
    isNull(journalEntry.deletedAt),
    notVatReturnClearing(),
  ];
  if (basis === "cash") clauses.push(cashEntryPredicate());

  const rows = await db
    .select({
      entryId: journalEntry.id,
      accountId: journalLine.accountId,
      debit: journalLine.debitAmount,
      credit: journalLine.creditAmount,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(and(...clauses));

  const lines: VatLine[] = rows.map((r) => ({
    entryKey: r.entryId,
    accountId: r.accountId,
    account: accountOf(r.accountId),
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
  }));
  if (basis === "cash") {
    for (const l of await loadCashRealisedLines(organizationId, { startDate, endDate }, { accountIds: ids })) {
      lines.push({
        entryKey: `${l.journalEntryId}:${l.settlementId}`,
        accountId: l.accountId,
        account: accountOf(l.accountId),
        debit: l.debit,
        credit: l.credit,
      });
    }
  }
  return lines;
}

export interface TaxReturnResult {
  basis: TaxBasis;
  totals: VatTotals;
  figures: DocumentFigures;
}

/** Load the VAT totals and turnover figures for a period on one basis. */
export async function computeTaxReturnInputs(
  organizationId: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis,
  config?: OrgTaxConfig
): Promise<TaxReturnResult> {
  const cfg = config ?? (await getOrgTaxConfig(organizationId));
  const [lines, docs] = await Promise.all([
    loadVatLines(organizationId, startDate, endDate, basis),
    loadTaxDocuments(organizationId, startDate, endDate, basis, cfg.country),
  ]);
  return { basis, totals: vatTotals(lines), figures: documentFigures(docs) };
}

/** The 9-box VAT return for a period (see vatReturnBoxes for the box rules). */
export async function computeVatReturn(
  organizationId: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis,
  opts: { flatRatePercent?: number | null; config?: OrgTaxConfig } = {}
): Promise<TaxReturnResult & { boxes: ReturnBox[] }> {
  const inputs = await computeTaxReturnInputs(organizationId, startDate, endDate, basis, opts.config);
  return { ...inputs, boxes: vatReturnBoxes(inputs.totals, inputs.figures, opts.flatRatePercent) };
}

/** The Australian BAS GST fields for a period (see basFields). */
export async function computeBas(
  organizationId: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis,
  config?: OrgTaxConfig
): Promise<TaxReturnResult & { fields: ReturnType<typeof basFields> }> {
  const inputs = await computeTaxReturnInputs(organizationId, startDate, endDate, basis, config);
  return { ...inputs, fields: basFields(inputs.totals, inputs.figures) };
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

/**
 * Box → control-account code + natural sign for drill-down. `reverseCharge`
 * splits the output VAT account like the return does: Box 1 leaves out the
 * self-accounted reverse-charge VAT that Box 2 reports.
 */
const BOX_ACCOUNT: Record<
  string,
  { code: "2200" | "1500"; sign: "credit" | "debit"; reverseCharge?: "exclude" | "only" }
> = {
  // VAT boxes
  "1": { code: "2200", sign: "credit", reverseCharge: "exclude" }, // output VAT due on sales
  "2": { code: "2200", sign: "credit", reverseCharge: "only" }, // reverse-charge acquisitions VAT
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
 * On the cash basis an invoice or bill line appears once per settlement in the
 * period, dated on the settlement and scaled to the settled share (the
 * description says which payment and what share).
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
  const [outputIds, inputId] = await Promise.all([
    getOutputControlAccountIds(organizationId),
    getControlAccountId(organizationId, "1500"),
  ]);
  const boxIds = mapping.code === "2200" ? outputIds : inputId ? [inputId] : [];
  if (boxIds.length === 0) return [];
  // Reverse-charge detection needs the input VAT lines of the same entries.
  const ids = [...boxIds, ...(mapping.reverseCharge && inputId ? [inputId] : [])];

  const clauses: (SQL | undefined)[] = [
    inArray(journalLine.accountId, ids),
    eq(journalEntry.organizationId, organizationId),
    eq(journalEntry.status, "posted"),
    gte(journalEntry.date, startDate),
    lte(journalEntry.date, endDate),
    isNull(journalEntry.deletedAt),
    notVatReturnClearing(),
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
      accountId: journalLine.accountId,
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

  type Row = BoxTransaction & { accountId: string; entryKey: string };
  const all: Row[] = rows.map((r) => {
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    return {
      entryKey: r.journalEntryId,
      accountId: r.accountId,
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
      amount: mapping.sign === "credit" ? credit - debit : debit - credit,
    };
  });

  if (basis === "cash") {
    const realised = await loadCashRealisedLines(organizationId, { startDate, endDate }, { accountIds: ids });
    for (const l of realised) {
      const pct = Math.round(l.fraction * 1000) / 10;
      all.push({
        entryKey: `${l.journalEntryId}:${l.settlementId}`,
        accountId: l.accountId,
        journalLineId: l.journalLineId,
        journalEntryId: l.journalEntryId,
        entryNumber: l.entryNumber,
        date: l.date,
        description: `${l.lineDescription ?? l.entryDescription} (${pct}% settled by ${l.paymentNumber})`,
        reference: l.reference,
        sourceType: l.sourceType,
        accountCode: l.code,
        accountName: l.name,
        debit: l.debit,
        credit: l.credit,
        amount: mapping.sign === "credit" ? l.credit - l.debit : l.debit - l.credit,
      });
    }
    all.sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber - b.entryNumber);
  }

  const reverseChargeKeys = new Set(
    all.filter((r) => r.accountId === inputId && r.debit > 0).map((r) => r.entryKey)
  );
  return all
    .filter((r) => boxIds.includes(r.accountId))
    .filter((r) =>
      mapping.reverseCharge === "exclude"
        ? !reverseChargeKeys.has(r.entryKey)
        : mapping.reverseCharge === "only"
          ? reverseChargeKeys.has(r.entryKey)
          : true
    )
    .map((r): BoxTransaction => ({
      journalLineId: r.journalLineId,
      journalEntryId: r.journalEntryId,
      entryNumber: r.entryNumber,
      date: r.date,
      description: r.description,
      reference: r.reference,
      sourceType: r.sourceType,
      accountCode: r.accountCode,
      accountName: r.accountName,
      debit: r.debit,
      credit: r.credit,
      amount: r.amount,
    }));
}
