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
import { journalEntry, chartAccount, taxRate, costCenter } from "./bookkeeping";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
]);

export const creditNoteStatusEnum = pgEnum("credit_note_status", [
  "draft",
  "sent",
  "applied",
  "void",
]);

// Invoice
export const invoice = pgTable("invoice", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id),
  invoiceNumber: text("invoice_number").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountPaid: integer("amount_paid").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  paymentLinkToken: text("payment_link_token").unique(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  sentAt: timestamp("sent_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Invoice Line
export const invoiceLine = pgTable("invoice_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100), // 2 decimal as int (1.00 = 100)
  unitPrice: integer("unit_price").notNull().default(0), // cents
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0), // qty * unitPrice (before tax)
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Quote
export const quote = pgTable("quote", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id),
  quoteNumber: text("quote_number").notNull(),
  issueDate: date("issue_date").notNull(),
  expiryDate: date("expiry_date").notNull(),
  status: quoteStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  convertedInvoiceId: uuid("converted_invoice_id"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Quote Line
export const quoteLine = pgTable("quote_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quote.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Credit Note (sales return/refund - reduces AR)
export const creditNote = pgTable("credit_note", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id),
  invoiceId: uuid("invoice_id").references(() => invoice.id), // original invoice, nullable
  creditNoteNumber: text("credit_note_number").notNull(),
  issueDate: date("issue_date").notNull(),
  status: creditNoteStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountApplied: integer("amount_applied").notNull().default(0),
  amountRemaining: integer("amount_remaining").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  sentAt: timestamp("sent_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Credit Note Line
export const creditNoteLine = pgTable("credit_note_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  creditNoteId: uuid("credit_note_id")
    .notNull()
    .references(() => creditNote.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  organization: one(organization, {
    fields: [invoice.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [invoice.contactId],
    references: [contact.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [invoice.journalEntryId],
    references: [journalEntry.id],
  }),
  createdByUser: one(users, {
    fields: [invoice.createdBy],
    references: [users.id],
  }),
  lines: many(invoiceLine),
  creditNotes: many(creditNote),
}));

export const invoiceLineRelations = relations(invoiceLine, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceLine.invoiceId],
    references: [invoice.id],
  }),
  account: one(chartAccount, {
    fields: [invoiceLine.accountId],
    references: [chartAccount.id],
  }),
  taxRate: one(taxRate, {
    fields: [invoiceLine.taxRateId],
    references: [taxRate.id],
  }),
  costCenter: one(costCenter, {
    fields: [invoiceLine.costCenterId],
    references: [costCenter.id],
  }),
}));

export const quoteRelations = relations(quote, ({ one, many }) => ({
  organization: one(organization, {
    fields: [quote.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [quote.contactId],
    references: [contact.id],
  }),
  createdByUser: one(users, {
    fields: [quote.createdBy],
    references: [users.id],
  }),
  lines: many(quoteLine),
}));

export const quoteLineRelations = relations(quoteLine, ({ one }) => ({
  quote: one(quote, {
    fields: [quoteLine.quoteId],
    references: [quote.id],
  }),
  account: one(chartAccount, {
    fields: [quoteLine.accountId],
    references: [chartAccount.id],
  }),
  taxRate: one(taxRate, {
    fields: [quoteLine.taxRateId],
    references: [taxRate.id],
  }),
  costCenter: one(costCenter, {
    fields: [quoteLine.costCenterId],
    references: [costCenter.id],
  }),
}));

export const creditNoteRelations = relations(creditNote, ({ one, many }) => ({
  organization: one(organization, {
    fields: [creditNote.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [creditNote.contactId],
    references: [contact.id],
  }),
  invoice: one(invoice, {
    fields: [creditNote.invoiceId],
    references: [invoice.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [creditNote.journalEntryId],
    references: [journalEntry.id],
  }),
  createdByUser: one(users, {
    fields: [creditNote.createdBy],
    references: [users.id],
  }),
  lines: many(creditNoteLine),
}));

export const creditNoteLineRelations = relations(creditNoteLine, ({ one }) => ({
  creditNote: one(creditNote, {
    fields: [creditNoteLine.creditNoteId],
    references: [creditNote.id],
  }),
  account: one(chartAccount, {
    fields: [creditNoteLine.accountId],
    references: [chartAccount.id],
  }),
  taxRate: one(taxRate, {
    fields: [creditNoteLine.taxRateId],
    references: [taxRate.id],
  }),
  costCenter: one(costCenter, {
    fields: [creditNoteLine.costCenterId],
    references: [costCenter.id],
  }),
}));
