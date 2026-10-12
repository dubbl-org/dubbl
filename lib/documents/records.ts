import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bankAccount,
  bankTransaction,
  bill,
  contact,
  creditNote,
  debitNote,
  expenseClaim,
  invoice,
  journalEntry,
  payment,
  paymentBatch,
  purchaseOrder,
  quote,
} from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/** Kinds of record a stored file can be attached to. */
export const LINKABLE = ["invoice", "bill", "quote", "expense", "payment", "journal_entry", "bank_transaction", "contact"] as const;
export type LinkableType = (typeof LINKABLE)[number];

export const LINKABLE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  quote: "Quote",
  expense: "Expense",
  payment: "Payment",
  journal_entry: "Journal entry",
  bank_transaction: "Bank transaction",
  contact: "Contact",
};

/** True when the record exists in this workspace, so files can't be pointed at someone else's data. */
export async function recordExists(orgId: string, type: LinkableType, id: string) {
  const one = async (q: Promise<unknown[]>) => (await q).length > 0;
  switch (type) {
    case "invoice":
      return one(db.select({ id: invoice.id }).from(invoice).where(and(eq(invoice.id, id), eq(invoice.organizationId, orgId), notDeleted(invoice.deletedAt))).limit(1));
    case "bill":
      return one(db.select({ id: bill.id }).from(bill).where(and(eq(bill.id, id), eq(bill.organizationId, orgId), notDeleted(bill.deletedAt))).limit(1));
    case "quote":
      return one(db.select({ id: quote.id }).from(quote).where(and(eq(quote.id, id), eq(quote.organizationId, orgId), notDeleted(quote.deletedAt))).limit(1));
    case "expense":
      return one(db.select({ id: expenseClaim.id }).from(expenseClaim).where(and(eq(expenseClaim.id, id), eq(expenseClaim.organizationId, orgId), notDeleted(expenseClaim.deletedAt))).limit(1));
    case "payment":
      return one(db.select({ id: payment.id }).from(payment).where(and(eq(payment.id, id), eq(payment.organizationId, orgId), notDeleted(payment.deletedAt))).limit(1));
    case "journal_entry":
      return one(db.select({ id: journalEntry.id }).from(journalEntry).where(and(eq(journalEntry.id, id), eq(journalEntry.organizationId, orgId), notDeleted(journalEntry.deletedAt))).limit(1));
    case "contact":
      return one(db.select({ id: contact.id }).from(contact).where(and(eq(contact.id, id), eq(contact.organizationId, orgId), notDeleted(contact.deletedAt))).limit(1));
    case "bank_transaction":
      return one(
        db
          .select({ id: bankTransaction.id })
          .from(bankTransaction)
          .innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.bankAccountId))
          .where(and(eq(bankTransaction.id, id), eq(bankAccount.organizationId, orgId), isNull(bankAccount.deletedAt)))
          .limit(1)
      );
  }
}

export interface RecordRef {
  /** Kind label, e.g. "Invoice". */
  kind: string;
  /** Human name, e.g. "INV-0042 · Acme". Null when the record was deleted. */
  label: string | null;
  /** Where the record lives in the app. */
  href: string | null;
}

const ids = (refs: { type: string; id: string }[], type: string) => [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];

/**
 * Turns `(entityType, entityId)` pairs into names and links in a handful of
 * queries, so lists of files or sent emails can say what they belong to.
 * Unknown kinds come back with just their kind label.
 */
export async function describeRecords(orgId: string, refs: { type: string; id: string }[]): Promise<Map<string, RecordRef>> {
  const out = new Map<string, RecordRef>();
  const put = (type: string, id: string, label: string | null, href: string | null) =>
    out.set(`${type}:${id}`, { kind: LINKABLE_LABELS[type] ?? DOCUMENT_TYPE_LABELS[type] ?? type.replace(/_/g, " "), label, href });

  const tasks: Promise<void>[] = [];
  const run = <T>(type: string, query: (list: string[]) => Promise<T[]>, map: (row: T) => [string, string, string]) => {
    const list = ids(refs, type);
    if (!list.length) return;
    tasks.push(
      query(list).then((rows) => {
        for (const row of rows) {
          const [id, label, href] = map(row);
          put(type, id, label, href);
        }
      })
    );
  };

  run(
    "invoice",
    (list) => db.query.invoice.findMany({ where: and(eq(invoice.organizationId, orgId), inArray(invoice.id, list)), columns: { id: true, invoiceNumber: true }, with: { contact: { columns: { name: true } } } }),
    (r) => [r.id, [r.invoiceNumber, r.contact?.name].filter(Boolean).join(" · "), `/sales/${r.id}`]
  );
  run(
    "quote",
    (list) => db.query.quote.findMany({ where: and(eq(quote.organizationId, orgId), inArray(quote.id, list)), columns: { id: true, quoteNumber: true }, with: { contact: { columns: { name: true } } } }),
    (r) => [r.id, [r.quoteNumber, r.contact?.name].filter(Boolean).join(" · "), `/sales/quotes/${r.id}`]
  );
  run(
    "credit_note",
    (list) => db.query.creditNote.findMany({ where: and(eq(creditNote.organizationId, orgId), inArray(creditNote.id, list)), columns: { id: true, creditNoteNumber: true }, with: { contact: { columns: { name: true } } } }),
    (r) => [r.id, [r.creditNoteNumber, r.contact?.name].filter(Boolean).join(" · "), `/sales/credit-notes/${r.id}`]
  );
  run(
    "bill",
    (list) => db.query.bill.findMany({ where: and(eq(bill.organizationId, orgId), inArray(bill.id, list)), columns: { id: true, billNumber: true }, with: { contact: { columns: { name: true } } } }),
    (r) => [r.id, [r.billNumber, r.contact?.name].filter(Boolean).join(" · "), `/purchases/${r.id}`]
  );
  run(
    "purchase_order",
    (list) => db.query.purchaseOrder.findMany({ where: and(eq(purchaseOrder.organizationId, orgId), inArray(purchaseOrder.id, list)), columns: { id: true, poNumber: true }, with: { contact: { columns: { name: true } } } }),
    (r) => [r.id, [r.poNumber, r.contact?.name].filter(Boolean).join(" · "), `/purchases/orders/${r.id}`]
  );
  run(
    "debit_note",
    (list) => db.query.debitNote.findMany({ where: and(eq(debitNote.organizationId, orgId), inArray(debitNote.id, list)), columns: { id: true, debitNoteNumber: true }, with: { contact: { columns: { name: true } } } }),
    (r) => [r.id, [r.debitNoteNumber, r.contact?.name].filter(Boolean).join(" · "), `/purchases/debit-notes/${r.id}`]
  );
  run(
    "expense",
    (list) => db.select({ id: expenseClaim.id, title: expenseClaim.title }).from(expenseClaim).where(and(eq(expenseClaim.organizationId, orgId), inArray(expenseClaim.id, list))),
    (r) => [r.id, r.title, `/purchases/expenses/${r.id}`]
  );
  run(
    "payment",
    (list) => db.select({ id: payment.id, number: payment.paymentNumber }).from(payment).where(and(eq(payment.organizationId, orgId), inArray(payment.id, list))),
    (r) => [r.id, r.number, `/sales/payments/${r.id}`]
  );
  run(
    "journal_entry",
    (list) => db.select({ id: journalEntry.id, number: journalEntry.entryNumber, description: journalEntry.description }).from(journalEntry).where(and(eq(journalEntry.organizationId, orgId), inArray(journalEntry.id, list))),
    (r) => [r.id, `#${r.number} · ${r.description}`, `/accounting/${r.id}`]
  );
  run(
    "contact",
    (list) => db.select({ id: contact.id, name: contact.name }).from(contact).where(and(eq(contact.organizationId, orgId), inArray(contact.id, list))),
    (r) => [r.id, r.name, `/contacts/${r.id}`]
  );
  run(
    "bank_transaction",
    (list) =>
      db
        .select({ id: bankTransaction.id, description: bankTransaction.description, accountId: bankTransaction.bankAccountId })
        .from(bankTransaction)
        .innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.bankAccountId))
        .where(and(eq(bankAccount.organizationId, orgId), inArray(bankTransaction.id, list))),
    (r) => [r.id, r.description, `/accounting/banking/${r.accountId}/transactions`]
  );
  run(
    "remittance_advice",
    (list) => db.select({ id: paymentBatch.id, name: paymentBatch.name }).from(paymentBatch).where(and(eq(paymentBatch.organizationId, orgId), inArray(paymentBatch.id, list))),
    (r) => [r.id, r.name, `/accounting/banking/batches/${r.id}`]
  );

  await Promise.all(tasks);
  // Anything we couldn't find (deleted, or a kind we don't know) still gets its kind label
  for (const r of refs) if (!out.has(`${r.type}:${r.id}`)) put(r.type, r.id, null, null);
  return out;
}

/** Document kinds that can be emailed from dubbl. */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  quote: "Quote",
  credit_note: "Credit note",
  purchase_order: "Purchase order",
  debit_note: "Supplier credit",
  remittance_advice: "Remittance advice",
};

export interface RecordOption {
  id: string;
  label: string;
  sub: string | null;
  /** Integer cents, when the record has an amount. */
  amount: number | null;
  currency: string | null;
  date: string | null;
}

/**
 * Up to 20 records of one kind matching `search` (number, name or
 * description), newest first. Powers the "attach to a record" picker.
 */
export async function searchRecords(orgId: string, type: LinkableType, search: string): Promise<RecordOption[]> {
  const q = `%${search.trim()}%`;
  const has = search.trim().length > 0;
  const iso = (d: Date | string | null) => (d == null ? null : typeof d === "string" ? d : d.toISOString());

  switch (type) {
    case "invoice": {
      const rows = await db
        .select({ id: invoice.id, number: invoice.invoiceNumber, name: contact.name, total: invoice.total, currency: invoice.currencyCode, date: invoice.issueDate })
        .from(invoice)
        .leftJoin(contact, eq(contact.id, invoice.contactId))
        .where(and(eq(invoice.organizationId, orgId), notDeleted(invoice.deletedAt), has ? or(ilike(invoice.invoiceNumber, q), ilike(contact.name, q)) : undefined))
        .orderBy(desc(invoice.issueDate))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.number, sub: r.name, amount: r.total, currency: r.currency, date: r.date }));
    }
    case "bill": {
      const rows = await db
        .select({ id: bill.id, number: bill.billNumber, name: contact.name, total: bill.total, currency: bill.currencyCode, date: bill.issueDate })
        .from(bill)
        .leftJoin(contact, eq(contact.id, bill.contactId))
        .where(and(eq(bill.organizationId, orgId), notDeleted(bill.deletedAt), has ? or(ilike(bill.billNumber, q), ilike(contact.name, q)) : undefined))
        .orderBy(desc(bill.issueDate))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.number, sub: r.name, amount: r.total, currency: r.currency, date: r.date }));
    }
    case "quote": {
      const rows = await db
        .select({ id: quote.id, number: quote.quoteNumber, name: contact.name, total: quote.total, currency: quote.currencyCode, date: quote.issueDate })
        .from(quote)
        .leftJoin(contact, eq(contact.id, quote.contactId))
        .where(and(eq(quote.organizationId, orgId), notDeleted(quote.deletedAt), has ? or(ilike(quote.quoteNumber, q), ilike(contact.name, q)) : undefined))
        .orderBy(desc(quote.issueDate))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.number, sub: r.name, amount: r.total, currency: r.currency, date: r.date }));
    }
    case "expense": {
      const rows = await db
        .select({ id: expenseClaim.id, title: expenseClaim.title, total: expenseClaim.totalAmount, date: expenseClaim.createdAt })
        .from(expenseClaim)
        .where(and(eq(expenseClaim.organizationId, orgId), notDeleted(expenseClaim.deletedAt), has ? ilike(expenseClaim.title, q) : undefined))
        .orderBy(desc(expenseClaim.createdAt))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.title, sub: null, amount: r.total, currency: null, date: iso(r.date) }));
    }
    case "payment": {
      const rows = await db
        .select({ id: payment.id, number: payment.paymentNumber, name: contact.name, amount: payment.amount, currency: payment.currencyCode, date: payment.date })
        .from(payment)
        .leftJoin(contact, eq(contact.id, payment.contactId))
        .where(and(eq(payment.organizationId, orgId), notDeleted(payment.deletedAt), has ? or(ilike(payment.paymentNumber, q), ilike(contact.name, q)) : undefined))
        .orderBy(desc(payment.date))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.number, sub: r.name, amount: r.amount, currency: r.currency, date: r.date }));
    }
    case "journal_entry": {
      const rows = await db
        .select({ id: journalEntry.id, number: journalEntry.entryNumber, description: journalEntry.description, date: journalEntry.date })
        .from(journalEntry)
        .where(and(eq(journalEntry.organizationId, orgId), notDeleted(journalEntry.deletedAt), has ? ilike(journalEntry.description, q) : undefined))
        .orderBy(desc(journalEntry.date))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: `#${r.number}`, sub: r.description, amount: null, currency: null, date: r.date }));
    }
    case "bank_transaction": {
      const rows = await db
        .select({ id: bankTransaction.id, description: bankTransaction.description, amount: bankTransaction.amount, date: bankTransaction.date, account: bankAccount.accountName, currency: bankAccount.currencyCode })
        .from(bankTransaction)
        .innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.bankAccountId))
        .where(and(eq(bankAccount.organizationId, orgId), isNull(bankAccount.deletedAt), has ? ilike(bankTransaction.description, q) : undefined))
        .orderBy(desc(bankTransaction.date))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.description, sub: r.account, amount: r.amount, currency: r.currency, date: r.date }));
    }
    case "contact": {
      const rows = await db
        .select({ id: contact.id, name: contact.name, email: contact.email })
        .from(contact)
        .where(and(eq(contact.organizationId, orgId), notDeleted(contact.deletedAt), has ? or(ilike(contact.name, q), ilike(contact.email, q)) : undefined))
        .orderBy(contact.name)
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name, sub: r.email, amount: null, currency: null, date: null }));
    }
  }
}
