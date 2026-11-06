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
import { organization } from "./auth";
import { bill } from "./bills";
import { contact } from "./contacts";
import { bankAccount } from "./banking";

export const scheduledPaymentStatusEnum = pgEnum("scheduled_payment_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const paymentBatchStatusEnum = pgEnum("payment_batch_status", [
  "draft",
  "submitted",
  "completed",
]);

export const scheduledPayment = pgTable("scheduled_payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").references(() => bill.id),
  contactId: uuid("contact_id").references(() => contact.id),
  amount: integer("amount").notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  scheduledDate: date("scheduled_date").notNull(),
  // The bank account the money will leave from. Null = the default bank
  // ledger account (1100), the behaviour before a choice was offered.
  bankAccountId: uuid("bank_account_id").references(() => bankAccount.id),
  status: scheduledPaymentStatusEnum("status").notNull().default("pending"),
  processedAt: timestamp("processed_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const paymentBatch = pgTable("payment_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: paymentBatchStatusEnum("status").notNull().default("draft"),
  totalAmount: integer("total_amount").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  paymentCount: integer("payment_count").notNull().default(0),
  // The bank account every payment in the batch is paid from. Null = the
  // default bank ledger account (1100).
  bankAccountId: uuid("bank_account_id").references(() => bankAccount.id),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const paymentBatchItem = pgTable("payment_batch_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => paymentBatch.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").references(() => bill.id),
  contactId: uuid("contact_id").references(() => contact.id),
  amount: integer("amount").notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  status: scheduledPaymentStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const scheduledPaymentRelations = relations(
  scheduledPayment,
  ({ one }) => ({
    organization: one(organization, {
      fields: [scheduledPayment.organizationId],
      references: [organization.id],
    }),
    bill: one(bill, {
      fields: [scheduledPayment.billId],
      references: [bill.id],
    }),
    contact: one(contact, {
      fields: [scheduledPayment.contactId],
      references: [contact.id],
    }),
    bankAccount: one(bankAccount, {
      fields: [scheduledPayment.bankAccountId],
      references: [bankAccount.id],
    }),
  })
);

export const paymentBatchRelations = relations(
  paymentBatch,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [paymentBatch.organizationId],
      references: [organization.id],
    }),
    bankAccount: one(bankAccount, {
      fields: [paymentBatch.bankAccountId],
      references: [bankAccount.id],
    }),
    items: many(paymentBatchItem),
  })
);

export const paymentBatchItemRelations = relations(
  paymentBatchItem,
  ({ one }) => ({
    batch: one(paymentBatch, {
      fields: [paymentBatchItem.batchId],
      references: [paymentBatch.id],
    }),
    bill: one(bill, {
      fields: [paymentBatchItem.billId],
      references: [bill.id],
    }),
    contact: one(contact, {
      fields: [paymentBatchItem.contactId],
      references: [contact.id],
    }),
  })
);
