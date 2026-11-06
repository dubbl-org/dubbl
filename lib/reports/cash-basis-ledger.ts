/**
 * Cash-basis loaders: read documents, their settlements and their journal
 * lines, and turn them into realised lines dated on the settlement date.
 *
 * The maths (and the model) are documented in lib/reports/cash-basis.ts. This
 * module only does the reading so gl-query (financial statements) and
 * tax-return (VAT / GST) can share it.
 *
 * Settlements are payment allocations to the document on a live (not deleted)
 * payment: real payments, credit notes applied to an invoice, customer
 * credits applied to an invoice and supplier debit notes applied to a bill
 * (all carried by a zero-cash payment row).
 * Document entries that already touch a bank account count as cash entries in
 * their own right and are skipped here so nothing is counted twice.
 */
import { db } from "@/lib/db";
import {
  bill,
  chartAccount,
  creditNote,
  debitNote,
  invoice,
  journalEntry,
  journalLine,
  payment,
  paymentAllocation,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, isNull, isNotNull, lte, ne, sql, type SQL } from "drizzle-orm";
import {
  CASH_REALISED_DOCUMENT_TYPES,
  CASH_SOURCE_TYPES,
  realiseDocument,
  type CashRealisedDocumentType,
  type Settlement,
} from "@/lib/reports/cash-basis";

/** A realised slice of one document journal line. Amounts in base cents. */
export interface CashRealisedLine {
  journalLineId: string;
  journalEntryId: string;
  entryNumber: number;
  entryDate: string;
  entryDescription: string;
  lineDescription: string | null;
  reference: string | null;
  sourceType: string | null;
  accountId: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subType: string | null;
  costCenterId: string | null;
  projectId: string | null;
  debit: number;
  credit: number;
  /** Settlement date: the date the line counts on the cash basis. */
  date: string;
  /** Payment allocation that realised this slice. */
  settlementId: string;
  paymentId: string;
  paymentNumber: string;
  documentType: CashRealisedDocumentType;
  documentId: string;
  /** Share of the document this settlement realised (0..1). */
  fraction: number;
}

/** A date window: inclusive bounds; no startDate means "everything up to endDate". */
export interface CashWindow {
  startDate?: string;
  endDate: string;
}

/** A document with the settlements dated up to the window end. */
export interface SettledDocument {
  documentType: CashRealisedDocumentType;
  documentId: string;
  total: number;
  journalEntryId: string;
  settlements: (Settlement & { paymentId: string; paymentNumber: string })[];
}

/**
 * Documents with at least one settlement inside the window, with every
 * settlement up to the window end (earlier ones are needed for the cumulative
 * rounding). Void, deleted and unposted documents are skipped.
 */
export async function loadSettledDocuments(
  organizationId: string,
  window: CashWindow,
  documentTypes: readonly CashRealisedDocumentType[] = CASH_REALISED_DOCUMENT_TYPES
): Promise<SettledDocument[]> {
  const settlementWhere = (dateClause: SQL | undefined) =>
    and(
      eq(payment.organizationId, organizationId),
      isNull(payment.deletedAt),
      inArray(paymentAllocation.documentType, [...documentTypes]),
      dateClause
    );

  const active = await db
    .selectDistinct({
      documentType: paymentAllocation.documentType,
      documentId: paymentAllocation.documentId,
    })
    .from(paymentAllocation)
    .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
    .where(
      settlementWhere(
        window.startDate
          ? and(gte(payment.date, window.startDate), lte(payment.date, window.endDate))
          : lte(payment.date, window.endDate)
      )
    );
  if (active.length === 0) return [];

  const idsByType = new Map<CashRealisedDocumentType, string[]>();
  for (const a of active) {
    const t = a.documentType as CashRealisedDocumentType;
    idsByType.set(t, [...(idsByType.get(t) ?? []), a.documentId]);
  }

  const docs = new Map<string, SettledDocument>();
  const keyOf = (t: string, id: string) => `${t}:${id}`;
  const addDocs = (
    t: CashRealisedDocumentType,
    rows: { id: string; total: number; journalEntryId: string | null }[]
  ) => {
    for (const r of rows) {
      if (!r.journalEntryId) continue;
      docs.set(keyOf(t, r.id), {
        documentType: t,
        documentId: r.id,
        total: Number(r.total),
        journalEntryId: r.journalEntryId,
        settlements: [],
      });
    }
  };

  const invoiceIds = idsByType.get("invoice");
  if (invoiceIds?.length) {
    addDocs(
      "invoice",
      await db
        .select({ id: invoice.id, total: invoice.total, journalEntryId: invoice.journalEntryId })
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, organizationId),
            inArray(invoice.id, invoiceIds),
            isNull(invoice.deletedAt),
            ne(invoice.status, "void"),
            isNotNull(invoice.journalEntryId)
          )
        )
    );
  }
  const billIds = idsByType.get("bill");
  if (billIds?.length) {
    addDocs(
      "bill",
      await db
        .select({ id: bill.id, total: bill.total, journalEntryId: bill.journalEntryId })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, organizationId),
            inArray(bill.id, billIds),
            isNull(bill.deletedAt),
            ne(bill.status, "void"),
            isNotNull(bill.journalEntryId)
          )
        )
    );
  }
  const creditNoteIds = idsByType.get("credit_note");
  if (creditNoteIds?.length) {
    addDocs(
      "credit_note",
      await db
        .select({ id: creditNote.id, total: creditNote.total, journalEntryId: creditNote.journalEntryId })
        .from(creditNote)
        .where(
          and(
            eq(creditNote.organizationId, organizationId),
            inArray(creditNote.id, creditNoteIds),
            isNull(creditNote.deletedAt),
            ne(creditNote.status, "void"),
            isNotNull(creditNote.journalEntryId)
          )
        )
    );
  }
  const debitNoteIds = idsByType.get("debit_note");
  if (debitNoteIds?.length) {
    addDocs(
      "debit_note",
      await db
        .select({ id: debitNote.id, total: debitNote.total, journalEntryId: debitNote.journalEntryId })
        .from(debitNote)
        .where(
          and(
            eq(debitNote.organizationId, organizationId),
            inArray(debitNote.id, debitNoteIds),
            isNull(debitNote.deletedAt),
            ne(debitNote.status, "void"),
            isNotNull(debitNote.journalEntryId)
          )
        )
    );
  }
  if (docs.size === 0) return [];

  const allIds = [...new Set([...docs.values()].map((d) => d.documentId))];
  const settlements = await db
    .select({
      id: paymentAllocation.id,
      documentType: paymentAllocation.documentType,
      documentId: paymentAllocation.documentId,
      amount: paymentAllocation.amount,
      date: payment.date,
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
    })
    .from(paymentAllocation)
    .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
    .where(
      and(
        settlementWhere(lte(payment.date, window.endDate)),
        inArray(paymentAllocation.documentId, allIds)
      )
    );
  for (const s of settlements) {
    const doc = docs.get(keyOf(s.documentType, s.documentId));
    if (!doc) continue;
    doc.settlements.push({
      id: s.id,
      date: s.date,
      amount: Number(s.amount),
      paymentId: s.paymentId,
      paymentNumber: s.paymentNumber,
    });
  }
  return [...docs.values()];
}

/**
 * Realised document lines for the window: every journal line of a settled
 * document's entry, scaled by each settlement inside the window and dated on
 * the settlement date. Pass `accountIds` to keep only lines on those accounts.
 */
export async function loadCashRealisedLines(
  organizationId: string,
  window: CashWindow,
  filter: { accountIds?: string[] } = {}
): Promise<CashRealisedLine[]> {
  const docs = await loadSettledDocuments(organizationId, window);
  if (docs.length === 0) return [];

  const entryIds = [...new Set(docs.map((d) => d.journalEntryId))];
  const rows = await db
    .select({
      journalLineId: journalLine.id,
      journalEntryId: journalEntry.id,
      entryNumber: journalEntry.entryNumber,
      entryDate: journalEntry.date,
      entryDescription: journalEntry.description,
      lineDescription: journalLine.description,
      reference: journalEntry.reference,
      sourceType: journalEntry.sourceType,
      accountId: chartAccount.id,
      code: chartAccount.code,
      name: chartAccount.name,
      type: chartAccount.type,
      subType: chartAccount.subType,
      costCenterId: journalLine.costCenterId,
      projectId: journalLine.projectId,
      debit: journalLine.debitAmount,
      credit: journalLine.creditAmount,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        inArray(journalEntry.id, entryIds),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt),
        // An entry that is already cash on its own counts on its own date.
        sql`coalesce(${journalEntry.sourceType}, '') not in (${sql.join(
          CASH_SOURCE_TYPES.map((s) => sql`${s}`),
          sql`, `
        )})`,
        sql`not exists (
          select 1 from ${journalLine} cash_jl
          join ${chartAccount} cash_acct on cash_acct.id = cash_jl.account_id
          where cash_jl.journal_entry_id = ${journalEntry.id}
            and cash_acct.sub_type = 'bank'
        )`
      )
    );

  const linesByEntry = new Map<string, typeof rows>();
  for (const r of rows) {
    linesByEntry.set(r.journalEntryId, [...(linesByEntry.get(r.journalEntryId) ?? []), r]);
  }

  const wanted = filter.accountIds ? new Set(filter.accountIds) : null;
  const out: CashRealisedLine[] = [];
  for (const doc of docs) {
    const entryLines = linesByEntry.get(doc.journalEntryId);
    if (!entryLines?.length) continue;
    const slices = realiseDocument(
      entryLines.map((l) => ({ ...l, id: l.journalLineId, debit: Number(l.debit), credit: Number(l.credit) })),
      doc.total,
      doc.settlements
    );
    for (const slice of slices) {
      const s = slice.settlement;
      if (s.date > window.endDate) continue;
      if (window.startDate && s.date < window.startDate) continue;
      const settlement = doc.settlements.find((x) => x.id === s.id)!;
      for (const l of slice.lines) {
        if (wanted && !wanted.has(l.accountId)) continue;
        out.push({
          journalLineId: l.journalLineId,
          journalEntryId: l.journalEntryId,
          entryNumber: l.entryNumber,
          entryDate: l.entryDate,
          entryDescription: l.entryDescription,
          lineDescription: l.lineDescription,
          reference: l.reference,
          sourceType: l.sourceType,
          accountId: l.accountId,
          code: l.code,
          name: l.name,
          type: l.type,
          subType: l.subType,
          costCenterId: l.costCenterId,
          projectId: l.projectId,
          debit: l.debit,
          credit: l.credit,
          date: s.date,
          settlementId: s.id,
          paymentId: settlement.paymentId,
          paymentNumber: settlement.paymentNumber,
          documentType: doc.documentType,
          documentId: doc.documentId,
          fraction: slice.fraction,
        });
      }
    }
  }
  return out;
}
