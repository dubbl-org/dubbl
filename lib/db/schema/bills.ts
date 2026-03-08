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
import { journalEntry, chartAccount, taxRate } from "./bookkeeping";

export const billStatusEnum = pgEnum("bill_status", [
  "draft",
  "pending_approval",
  "received",
  "partial",
  "paid",
  "overdue",
  "void",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "sent",
  "partial",
  "received",
  "closed",
  "void",
]);

export const debitNoteStatusEnum = pgEnum("debit_note_status", [
  "draft",
  "sent",
  "applied",
  "void",
]);

// Bill
export const bill = pgTable("bill", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  billNumber: text("bill_number").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: billStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountPaid: integer("amount_paid").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  receivedAt: timestamp("received_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  rejectedAt: timestamp("rejected_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const billLine = pgTable("bill_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bill.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Purchase Order
export const purchaseOrder = pgTable("purchase_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  poNumber: text("po_number").notNull(),
  issueDate: date("issue_date").notNull(),
  deliveryDate: date("delivery_date"),
  status: purchaseOrderStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  convertedBillId: uuid("converted_bill_id"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const purchaseOrderLine = pgTable("purchase_order_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrder.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Debit Note (purchase return - reduces AP)
export const debitNote = pgTable("debit_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  billId: uuid("bill_id").references(() => bill.id), // original bill, nullable
  debitNoteNumber: text("debit_note_number").notNull(),
  issueDate: date("issue_date").notNull(),
  status: debitNoteStatusEnum("status").notNull().default("draft"),
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

export const debitNoteLine = pgTable("debit_note_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  debitNoteId: uuid("debit_note_id").notNull().references(() => debitNote.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const billRelations = relations(bill, ({ one, many }) => ({
  organization: one(organization, { fields: [bill.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [bill.contactId], references: [contact.id] }),
  journalEntry: one(journalEntry, { fields: [bill.journalEntryId], references: [journalEntry.id] }),
  createdByUser: one(users, { fields: [bill.createdBy], references: [users.id] }),
  lines: many(billLine),
  debitNotes: many(debitNote),
}));

export const billLineRelations = relations(billLine, ({ one }) => ({
  bill: one(bill, { fields: [billLine.billId], references: [bill.id] }),
  account: one(chartAccount, { fields: [billLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [billLine.taxRateId], references: [taxRate.id] }),
}));

export const purchaseOrderRelations = relations(purchaseOrder, ({ one, many }) => ({
  organization: one(organization, { fields: [purchaseOrder.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [purchaseOrder.contactId], references: [contact.id] }),
  createdByUser: one(users, { fields: [purchaseOrder.createdBy], references: [users.id] }),
  lines: many(purchaseOrderLine),
}));

export const purchaseOrderLineRelations = relations(purchaseOrderLine, ({ one }) => ({
  purchaseOrder: one(purchaseOrder, { fields: [purchaseOrderLine.purchaseOrderId], references: [purchaseOrder.id] }),
  account: one(chartAccount, { fields: [purchaseOrderLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [purchaseOrderLine.taxRateId], references: [taxRate.id] }),
}));

export const debitNoteRelations = relations(debitNote, ({ one, many }) => ({
  organization: one(organization, { fields: [debitNote.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [debitNote.contactId], references: [contact.id] }),
  bill: one(bill, { fields: [debitNote.billId], references: [bill.id] }),
  journalEntry: one(journalEntry, { fields: [debitNote.journalEntryId], references: [journalEntry.id] }),
  createdByUser: one(users, { fields: [debitNote.createdBy], references: [users.id] }),
  lines: many(debitNoteLine),
}));

export const debitNoteLineRelations = relations(debitNoteLine, ({ one }) => ({
  debitNote: one(debitNote, { fields: [debitNoteLine.debitNoteId], references: [debitNote.id] }),
  account: one(chartAccount, { fields: [debitNoteLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [debitNoteLine.taxRateId], references: [taxRate.id] }),
}));
