import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";
import { contact } from "./contacts";
import { journalEntry } from "./bookkeeping";
import { bankAccount, bankTransaction } from "./banking";

export const paymentTypeEnum = pgEnum("payment_type", [
  "received", // customer payment (reduces AR)
  "made",     // supplier payment (reduces AP)
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "cash",
  "check",
  "card",
  "other",
]);

// Payment record
export const payment = pgTable("payment", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id),
  paymentNumber: text("payment_number").notNull(),
  type: paymentTypeEnum("type").notNull(),
  date: date("date").notNull(),
  amount: integer("amount").notNull().default(0), // total payment in cents
  method: paymentMethodEnum("method").notNull().default("bank_transfer"),
  reference: text("reference"), // check number, transfer ref, etc.
  notes: text("notes"),
  bankAccountId: uuid("bank_account_id").references(() => bankAccount.id),
  bankTransactionId: uuid("bank_transaction_id").references(() => bankTransaction.id),
  currencyCode: text("currency_code").notNull().default("USD"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Payment allocation - maps payment amounts to specific invoices/bills/credit notes/debit notes
export const paymentAllocation = pgTable("payment_allocation", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payment.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(), // "invoice", "bill", "credit_note", "debit_note"
  documentId: uuid("document_id").notNull(),
  amount: integer("amount").notNull().default(0), // cents allocated to this document
});

// Relations
export const paymentRelations = relations(payment, ({ one, many }) => ({
  organization: one(organization, {
    fields: [payment.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [payment.contactId],
    references: [contact.id],
  }),
  bankAccount: one(bankAccount, {
    fields: [payment.bankAccountId],
    references: [bankAccount.id],
  }),
  bankTransaction: one(bankTransaction, {
    fields: [payment.bankTransactionId],
    references: [bankTransaction.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [payment.journalEntryId],
    references: [journalEntry.id],
  }),
  createdByUser: one(users, {
    fields: [payment.createdBy],
    references: [users.id],
  }),
  allocations: many(paymentAllocation),
}));

export const paymentAllocationRelations = relations(paymentAllocation, ({ one }) => ({
  payment: one(payment, {
    fields: [paymentAllocation.paymentId],
    references: [payment.id],
  }),
}));
