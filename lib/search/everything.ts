import { db } from "@/lib/db";
import {
  bankAccount,
  bankTransaction,
  bill,
  contact,
  document,
  expenseClaim,
  inventoryItem,
  invoice,
  journalEntry,
  payment,
  quote,
} from "@/lib/db/schema";
import { and, between, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { notDeleted } from "@/lib/db/soft-delete";

export const SEARCH_TYPES = [
  "invoice",
  "bill",
  "quote",
  "expense",
  "payment",
  "contact",
  "bank_transaction",
  "journal_entry",
  "item",
  "document",
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export interface EverythingResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  /** Integer cents, when the record has an amount. */
  amount: number | null;
  currency: string | null;
  date: string | null;
  status: string | null;
  href: string;
}

export interface EverythingQuery {
  organizationId: string;
  userId: string;
  query?: string;
  /** Match records whose amount is this many cents (sign ignored). */
  amount?: number;
  /** How far off the amount may be, in cents. */
  amountTolerance?: number;
  types?: SearchType[];
  limitPerType?: number;
}

const day = (d: Date | string | null | undefined) => (d == null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/**
 * One search across the whole workspace: sales, purchases, spending, money in
 * and out of the bank, the ledger, stock and files. Text matches numbers,
 * references, names and descriptions; an optional amount narrows to records
 * of that size, which is how an uploaded receipt finds its bank line or bill.
 */
export async function searchEverything(q: EverythingQuery): Promise<EverythingResult[]> {
  const text = q.query?.trim() ?? "";
  const term = text.length >= 2 ? `%${text}%` : null;
  const limit = Math.min(Math.max(q.limitPerType ?? 5, 1), 20);
  const want = (t: SearchType) => !q.types?.length || q.types.includes(t);
  const tol = Math.max(q.amountTolerance ?? 0, 0);
  const near = (col: AnyPgColumn) =>
    q.amount == null ? undefined : between(sql`abs(${col})`, Math.max(Math.abs(q.amount) - tol, 0), Math.abs(q.amount) + tol);
  if (!term && q.amount == null) return [];

  const org = q.organizationId;
  const jobs: Promise<EverythingResult[]>[] = [];

  if (want("invoice")) {
    jobs.push(
      db
        .select({ r: invoice, contactName: contact.name })
        .from(invoice)
        .leftJoin(contact, eq(contact.id, invoice.contactId))
        .where(
          and(
            eq(invoice.organizationId, org),
            notDeleted(invoice.deletedAt),
            term ? or(ilike(invoice.invoiceNumber, term), ilike(invoice.reference, term), ilike(contact.name, term), ilike(invoice.notes, term)) : undefined,
            near(invoice.total)
          )
        )
        .orderBy(desc(invoice.issueDate))
        .limit(limit)
        .then((rows) =>
          rows.map(({ r, contactName }) => ({
            type: "invoice" as const,
            id: r.id,
            title: r.invoiceNumber,
            subtitle: contactName,
            amount: r.total,
            currency: r.currencyCode,
            date: day(r.issueDate),
            status: r.status,
            href: `/sales/${r.id}`,
          }))
        )
    );
  }

  if (want("bill")) {
    jobs.push(
      db
        .select({ r: bill, contactName: contact.name })
        .from(bill)
        .leftJoin(contact, eq(contact.id, bill.contactId))
        .where(
          and(
            eq(bill.organizationId, org),
            notDeleted(bill.deletedAt),
            term ? or(ilike(bill.billNumber, term), ilike(bill.reference, term), ilike(contact.name, term), ilike(bill.notes, term)) : undefined,
            near(bill.total)
          )
        )
        .orderBy(desc(bill.issueDate))
        .limit(limit)
        .then((rows) =>
          rows.map(({ r, contactName }) => ({
            type: "bill" as const,
            id: r.id,
            title: r.billNumber,
            subtitle: contactName,
            amount: r.total,
            currency: r.currencyCode,
            date: day(r.issueDate),
            status: r.status,
            href: `/purchases/${r.id}`,
          }))
        )
    );
  }

  if (want("quote")) {
    jobs.push(
      db
        .select({ r: quote, contactName: contact.name })
        .from(quote)
        .leftJoin(contact, eq(contact.id, quote.contactId))
        .where(
          and(
            eq(quote.organizationId, org),
            notDeleted(quote.deletedAt),
            term ? or(ilike(quote.quoteNumber, term), ilike(quote.reference, term), ilike(contact.name, term)) : undefined,
            near(quote.total)
          )
        )
        .orderBy(desc(quote.issueDate))
        .limit(limit)
        .then((rows) =>
          rows.map(({ r, contactName }) => ({
            type: "quote" as const,
            id: r.id,
            title: r.quoteNumber,
            subtitle: contactName,
            amount: r.total,
            currency: r.currencyCode,
            date: day(r.issueDate),
            status: r.status,
            href: `/sales/quotes/${r.id}`,
          }))
        )
    );
  }

  if (want("expense")) {
    jobs.push(
      db
        .select()
        .from(expenseClaim)
        .where(
          and(
            eq(expenseClaim.organizationId, org),
            notDeleted(expenseClaim.deletedAt),
            term ? or(ilike(expenseClaim.title, term), ilike(expenseClaim.description, term)) : undefined,
            near(expenseClaim.totalAmount)
          )
        )
        .orderBy(desc(expenseClaim.createdAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            type: "expense" as const,
            id: r.id,
            title: r.title,
            subtitle: r.description,
            amount: r.totalAmount,
            currency: r.currencyCode,
            date: day(r.submittedAt ?? r.createdAt),
            status: r.status,
            href: `/purchases/expenses/${r.id}`,
          }))
        )
    );
  }

  if (want("payment")) {
    jobs.push(
      db
        .select({ r: payment, contactName: contact.name })
        .from(payment)
        .leftJoin(contact, eq(contact.id, payment.contactId))
        .where(
          and(
            eq(payment.organizationId, org),
            notDeleted(payment.deletedAt),
            term ? or(ilike(payment.paymentNumber, term), ilike(payment.reference, term), ilike(contact.name, term)) : undefined,
            near(payment.amount)
          )
        )
        .orderBy(desc(payment.date))
        .limit(limit)
        .then((rows) =>
          rows.map(({ r, contactName }) => ({
            type: "payment" as const,
            id: r.id,
            title: r.paymentNumber,
            subtitle: [r.type === "received" ? "Received from" : "Paid to", contactName].filter(Boolean).join(" "),
            amount: r.amount,
            currency: r.currencyCode,
            date: day(r.date),
            status: r.type,
            href: `/sales/payments`,
          }))
        )
    );
  }

  if (want("contact") && term) {
    jobs.push(
      db
        .select()
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, org),
            notDeleted(contact.deletedAt),
            or(ilike(contact.name, term), ilike(contact.email, term), ilike(contact.taxNumber, term), ilike(contact.phone, term))
          )
        )
        .orderBy(desc(contact.createdAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            type: "contact" as const,
            id: r.id,
            title: r.name,
            subtitle: [r.type, r.email].filter(Boolean).join(" · ") || null,
            amount: null,
            currency: r.currencyCode,
            date: null,
            status: r.type,
            href: `/contacts/${r.id}`,
          }))
        )
    );
  }

  if (want("bank_transaction")) {
    jobs.push(
      db
        .select({ r: bankTransaction, accountName: bankAccount.accountName, accountCurrency: bankAccount.currencyCode })
        .from(bankTransaction)
        .innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.bankAccountId))
        .where(
          and(
            eq(bankAccount.organizationId, org),
            isNull(bankAccount.deletedAt),
            term
              ? or(
                  ilike(bankTransaction.description, term),
                  ilike(bankTransaction.reference, term),
                  ilike(bankTransaction.payee, term),
                  ilike(bankTransaction.counterparty, term)
                )
              : undefined,
            near(bankTransaction.amount)
          )
        )
        .orderBy(desc(bankTransaction.date))
        .limit(limit)
        .then((rows) =>
          rows.map(({ r, accountName, accountCurrency }) => ({
            type: "bank_transaction" as const,
            id: r.id,
            title: r.description,
            subtitle: [accountName, r.payee].filter(Boolean).join(" · ") || null,
            amount: r.amount,
            currency: r.currencyCode ?? accountCurrency,
            date: day(r.date),
            status: r.status,
            href: `/accounting/banking/${r.bankAccountId}`,
          }))
        )
    );
  }

  if (want("journal_entry") && term) {
    jobs.push(
      db
        .select()
        .from(journalEntry)
        .where(
          and(
            eq(journalEntry.organizationId, org),
            notDeleted(journalEntry.deletedAt),
            or(ilike(journalEntry.description, term), ilike(journalEntry.reference, term))
          )
        )
        .orderBy(desc(journalEntry.date))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            type: "journal_entry" as const,
            id: r.id,
            title: `Entry ${r.entryNumber}`,
            subtitle: r.description,
            amount: null,
            currency: null,
            date: day(r.date),
            status: r.status,
            href: `/accounting/${r.id}`,
          }))
        )
    );
  }

  if (want("item") && term) {
    jobs.push(
      db
        .select()
        .from(inventoryItem)
        .where(
          and(
            eq(inventoryItem.organizationId, org),
            notDeleted(inventoryItem.deletedAt),
            or(ilike(inventoryItem.name, term), ilike(inventoryItem.code, term), ilike(inventoryItem.sku, term))
          )
        )
        .orderBy(desc(inventoryItem.createdAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            type: "item" as const,
            id: r.id,
            title: r.name,
            subtitle: r.code,
            amount: r.salePrice,
            currency: null,
            date: null,
            status: r.isActive ? "active" : "inactive",
            href: `/inventory/${r.id}`,
          }))
        )
    );
  }

  if (want("document") && term) {
    jobs.push(
      db
        .select()
        .from(document)
        .where(
          and(
            eq(document.organizationId, org),
            notDeleted(document.deletedAt),
            or(eq(document.visibility, "organization"), eq(document.uploadedBy, q.userId)),
            ilike(document.fileName, term)
          )
        )
        .orderBy(desc(document.createdAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            type: "document" as const,
            id: r.id,
            title: r.fileName,
            subtitle: r.entityType ? `Linked to ${r.entityType.replace(/_/g, " ")}` : "Not linked to a record",
            amount: null,
            currency: null,
            date: day(r.createdAt),
            status: null,
            href: `/documents`,
          }))
        )
    );
  }

  return (await Promise.all(jobs)).flat();
}
