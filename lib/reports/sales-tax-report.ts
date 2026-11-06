/**
 * Sales tax report loader shared by the REST route (/api/v1/reports/sales-tax)
 * and the MCP sales_tax_report tool. Reads every sales document in the period
 * and hands its lines to the pure salesTaxBreakdown():
 *   - invoices issued in the period,
 *   - cash sales (sales receipts) dated in it,
 *   - credit notes issued in it, which count negative (tax given back).
 * Drafts, voided and unapproved documents are left out. Amounts convert to the
 * base currency at each document's posting rate, so the report agrees with the
 * tax account and the filed tax period. Integer cents.
 */
import { db } from "@/lib/db";
import {
  contact,
  creditNote,
  creditNoteLine,
  invoice,
  invoiceLine,
  journalLine,
  organization,
  salesReceipt,
  salesReceiptLine,
  taxRate,
} from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { salesTaxBreakdown, type SalesTaxLine } from "@/lib/reports/sales-tax";

/** Document -> base rate (x1,000,000) from its posted journal lines; 1.0 when not posted. */
function rateSql(journalEntryId: AnyPgColumn): SQL<number> {
  return sql<number>`coalesce((select max(rate_jl.exchange_rate) from ${journalLine} rate_jl where rate_jl.journal_entry_id = ${journalEntryId}), 1000000)`.mapWith(Number);
}

const toBase = (cents: number, rate: number) => Math.round((cents * (rate || 1_000_000)) / 1_000_000);

export async function computeSalesTaxReport(organizationId: string, startDate: string, endDate: string) {
  const rateCols = {
    taxRateId: taxRate.id,
    taxRateName: taxRate.name,
    taxRatePercent: taxRate.rate,
    taxRateKind: taxRate.kind,
  };
  const [invoiceRows, receiptRows, creditRows, org] = await Promise.all([
    db
      .select({
        docId: invoice.id,
        amount: invoiceLine.amount,
        taxAmount: invoiceLine.taxAmount,
        fx: rateSql(invoice.journalEntryId),
        contactTaxExempt: contact.isTaxExempt,
        ...rateCols,
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .innerJoin(contact, eq(invoice.contactId, contact.id))
      .leftJoin(taxRate, eq(invoiceLine.taxRateId, taxRate.id))
      .where(
        and(
          eq(invoice.organizationId, organizationId),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate),
          notInArray(invoice.status, ["draft", "void", "pending_approval", "rejected"]),
          isNull(invoice.deletedAt)
        )
      ),
    db
      .select({
        docId: salesReceipt.id,
        amount: salesReceiptLine.amount,
        taxAmount: salesReceiptLine.taxAmount,
        fx: rateSql(salesReceipt.journalEntryId),
        contactTaxExempt: contact.isTaxExempt,
        ...rateCols,
      })
      .from(salesReceiptLine)
      .innerJoin(salesReceipt, eq(salesReceiptLine.salesReceiptId, salesReceipt.id))
      .leftJoin(contact, eq(salesReceipt.contactId, contact.id))
      .leftJoin(taxRate, eq(salesReceiptLine.taxRateId, taxRate.id))
      .where(
        and(
          eq(salesReceipt.organizationId, organizationId),
          gte(salesReceipt.date, startDate),
          lte(salesReceipt.date, endDate),
          eq(salesReceipt.status, "paid"),
          isNull(salesReceipt.deletedAt)
        )
      ),
    db
      .select({
        docId: creditNote.id,
        amount: creditNoteLine.amount,
        taxAmount: creditNoteLine.taxAmount,
        fx: rateSql(creditNote.journalEntryId),
        contactTaxExempt: contact.isTaxExempt,
        ...rateCols,
      })
      .from(creditNoteLine)
      .innerJoin(creditNote, eq(creditNoteLine.creditNoteId, creditNote.id))
      .innerJoin(contact, eq(creditNote.contactId, contact.id))
      .leftJoin(taxRate, eq(creditNoteLine.taxRateId, taxRate.id))
      .where(
        and(
          eq(creditNote.organizationId, organizationId),
          gte(creditNote.issueDate, startDate),
          lte(creditNote.issueDate, endDate),
          notInArray(creditNote.status, ["draft", "void"]),
          isNull(creditNote.deletedAt)
        )
      ),
    db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { defaultCurrency: true },
    }),
  ]);

  type Row = (typeof invoiceRows)[number];
  const toLines = (rows: Row[], sign: 1 | -1): SalesTaxLine[] =>
    rows.map((l) => ({
      invoiceId: l.docId,
      amount: sign * toBase(Number(l.amount), Number(l.fx)),
      taxAmount: sign * toBase(Number(l.taxAmount), Number(l.fx)),
      taxRate: l.taxRateId
        ? { id: l.taxRateId, name: l.taxRateName ?? "", rate: l.taxRatePercent ?? 0, kind: l.taxRateKind ?? "standard" }
        : null,
      contactTaxExempt: Boolean(l.contactTaxExempt),
    }));

  const result = salesTaxBreakdown([
    ...toLines(invoiceRows, 1),
    ...toLines(receiptRows as Row[], 1),
    ...toLines(creditRows as Row[], -1),
  ]);

  const distinct = (rows: { docId: string }[]) => new Set(rows.map((r) => r.docId)).size;
  return {
    ...result,
    /** How many of each document the figures come from. */
    documentCounts: {
      invoices: distinct(invoiceRows),
      salesReceipts: distinct(receiptRows),
      creditNotes: distinct(creditRows),
    },
    currency: org?.defaultCurrency ?? "USD",
    period: { startDate, endDate },
  };
}
