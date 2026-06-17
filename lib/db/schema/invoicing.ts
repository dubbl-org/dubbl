import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";
import { contact } from "./contacts";
import { journalEntry, chartAccount, taxRate, costCenter } from "./bookkeeping";
import { inventoryItem, warehouse } from "./inventory";
import { bankAccount } from "./banking";

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

// Sales Receipt (cash sale): records payment + revenue in one step, no AR.
export const salesReceiptStatusEnum = pgEnum("sales_receipt_status", [
  "draft",
  "paid",
  "void",
]);

// Customer Credit: prepayments/deposits/overpayments held on account.
export const customerCreditSourceEnum = pgEnum("customer_credit_source", [
  "prepayment",
  "overpayment",
  "credit_note",
]);

export const customerCreditStatusEnum = pgEnum("customer_credit_status", [
  "open",
  "applied",
  "refunded",
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
  senderSnapshot: jsonb("sender_snapshot"),
  recipientSnapshot: jsonb("recipient_snapshot"),
  paymentLinkToken: text("payment_link_token").unique(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  sentAt: timestamp("sent_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  writtenOffAt: timestamp("written_off_at", { mode: "date" }), // bad-debt write-off marker
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
  discountPercent: integer("discount_percent").notNull().default(0), // basis points: 1000 = 10%
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0), // qty * unitPrice - discount (before tax)
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  // Job-costing dimension. Project lives in ./projects; plain uuid (no FK) to avoid import cycle.
  projectId: uuid("project_id"),
  // When set, selling this line relieves inventory and posts COGS for the item.
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItem.id),
  warehouseId: uuid("warehouse_id").references(() => warehouse.id),
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
  billedTotal: integer("billed_total").notNull().default(0), // cents already invoiced via progress/milestone billing
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
  discountPercent: integer("discount_percent").notNull().default(0), // basis points: 1000 = 10%
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
  discountPercent: integer("discount_percent").notNull().default(0), // basis points: 1000 = 10%
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Sales Receipt (cash sale - mirrors invoice shape, but settles immediately to a bank/deposit account)
export const salesReceipt = pgTable("sales_receipt", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id),
  receiptNumber: text("receipt_number").notNull(),
  date: date("date").notNull(),
  status: salesReceiptStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  // Money lands in a bank account (preferred) or, failing that, a chart-of-accounts deposit account.
  bankAccountId: uuid("bank_account_id").references(() => bankAccount.id),
  depositAccountId: uuid("deposit_account_id").references(() => chartAccount.id),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Sales Receipt Line (mirrors invoice line, incl. inventory/COGS dimensions)
export const salesReceiptLine = pgTable("sales_receipt_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  salesReceiptId: uuid("sales_receipt_id")
    .notNull()
    .references(() => salesReceipt.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100), // 2 decimal as int (1.00 = 100)
  unitPrice: integer("unit_price").notNull().default(0), // cents
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  discountPercent: integer("discount_percent").notNull().default(0), // basis points: 1000 = 10%
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0), // qty * unitPrice - discount (before tax)
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  projectId: uuid("project_id"), // job-costing dimension (plain uuid; project lives in ./projects)
  // When set, selling this line relieves inventory and posts COGS for the item.
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItem.id),
  warehouseId: uuid("warehouse_id").references(() => warehouse.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Customer Credit (prepayments / customer deposits / overpayments held on account)
export const customerCredit = pgTable("customer_credit", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id),
  date: date("date").notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  originalAmount: integer("original_amount").notNull().default(0), // cents
  amountRemaining: integer("amount_remaining").notNull().default(0), // cents unapplied/available
  sourceType: customerCreditSourceEnum("source_type").notNull(),
  status: customerCreditStatusEnum("status").notNull().default("open"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Signature
export const signatureStatusEnum = pgEnum("signature_status", [
  "pending", "signed", "declined", "expired",
]);

export const invoiceSignature = pgTable("invoice_signature", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoice.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull(),
  signatureDataUrl: text("signature_data_url"),
  status: signatureStatusEnum("status").notNull().default("pending"),
  signedAt: timestamp("signed_at", { mode: "date" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestedAt: timestamp("requested_at", { mode: "date" }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const invoiceSignatureRelations = relations(invoiceSignature, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceSignature.invoiceId],
    references: [invoice.id],
  }),
}));

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
  signatures: many(invoiceSignature),
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

export const salesReceiptRelations = relations(salesReceipt, ({ one, many }) => ({
  organization: one(organization, {
    fields: [salesReceipt.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [salesReceipt.contactId],
    references: [contact.id],
  }),
  bankAccount: one(bankAccount, {
    fields: [salesReceipt.bankAccountId],
    references: [bankAccount.id],
  }),
  depositAccount: one(chartAccount, {
    fields: [salesReceipt.depositAccountId],
    references: [chartAccount.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [salesReceipt.journalEntryId],
    references: [journalEntry.id],
  }),
  createdByUser: one(users, {
    fields: [salesReceipt.createdBy],
    references: [users.id],
  }),
  lines: many(salesReceiptLine),
}));

export const salesReceiptLineRelations = relations(salesReceiptLine, ({ one }) => ({
  salesReceipt: one(salesReceipt, {
    fields: [salesReceiptLine.salesReceiptId],
    references: [salesReceipt.id],
  }),
  account: one(chartAccount, {
    fields: [salesReceiptLine.accountId],
    references: [chartAccount.id],
  }),
  taxRate: one(taxRate, {
    fields: [salesReceiptLine.taxRateId],
    references: [taxRate.id],
  }),
  costCenter: one(costCenter, {
    fields: [salesReceiptLine.costCenterId],
    references: [costCenter.id],
  }),
}));

export const customerCreditRelations = relations(customerCredit, ({ one }) => ({
  organization: one(organization, {
    fields: [customerCredit.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [customerCredit.contactId],
    references: [contact.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [customerCredit.journalEntryId],
    references: [journalEntry.id],
  }),
  createdByUser: one(users, {
    fields: [customerCredit.createdBy],
    references: [users.id],
  }),
}));
