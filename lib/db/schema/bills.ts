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

export const billStatusEnum = pgEnum("bill_status", [
  "draft",
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

// Bill
export const bill = pgTable("bill", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contact.id),
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
  journalEntryId: text("journal_entry_id").references(() => journalEntry.id),
  receivedAt: timestamp("received_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const billLine = pgTable("bill_line", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  billId: text("bill_id").notNull().references(() => bill.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: text("account_id").references(() => chartAccount.id),
  taxRateId: text("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Purchase Order
export const purchaseOrder = pgTable("purchase_order", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contact.id),
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
  convertedBillId: text("converted_bill_id"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const purchaseOrderLine = pgTable("purchase_order_line", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => purchaseOrder.id, { onDelete: "cascade" }),
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
export const billRelations = relations(bill, ({ one, many }) => ({
  organization: one(organization, { fields: [bill.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [bill.contactId], references: [contact.id] }),
  journalEntry: one(journalEntry, { fields: [bill.journalEntryId], references: [journalEntry.id] }),
  createdByUser: one(users, { fields: [bill.createdBy], references: [users.id] }),
  lines: many(billLine),
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
