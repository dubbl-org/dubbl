import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";
import { organization, users } from "./auth";
import { contact } from "./contacts";
import { journalEntry, chartAccount, taxRate } from "./bookkeeping";

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

// Invoice
export const invoice = pgTable("invoice", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: text("contact_id")
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
  journalEntryId: text("journal_entry_id").references(() => journalEntry.id),
  sentAt: timestamp("sent_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Invoice Line
export const invoiceLine = pgTable("invoice_line", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoice.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100), // 2 decimal as int (1.00 = 100)
  unitPrice: integer("unit_price").notNull().default(0), // cents
  accountId: text("account_id").references(() => chartAccount.id),
  taxRateId: text("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0), // qty * unitPrice (before tax)
  sortOrder: integer("sort_order").notNull().default(0),
});

// Quote
export const quote = pgTable("quote", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: text("contact_id")
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
  convertedInvoiceId: text("converted_invoice_id"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Quote Line
export const quoteLine = pgTable("quote_line", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  quoteId: text("quote_id")
    .notNull()
    .references(() => quote.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: text("account_id").references(() => chartAccount.id),
  taxRateId: text("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
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
}));
