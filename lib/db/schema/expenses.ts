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
import { journalEntry, chartAccount } from "./bookkeeping";

export const expenseStatusEnum = pgEnum("expense_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "paid",
]);

// Expense Claim
export const expenseClaim = pgTable("expense_claim", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  submittedBy: text("submitted_by").notNull().references(() => users.id),
  status: expenseStatusEnum("status").notNull().default("draft"),
  totalAmount: integer("total_amount").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  approvedBy: text("approved_by").references(() => users.id),
  journalEntryId: text("journal_entry_id").references(() => journalEntry.id),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  rejectedAt: timestamp("rejected_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Expense Item
export const expenseItem = pgTable("expense_item", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  expenseClaimId: text("expense_claim_id").notNull().references(() => expenseClaim.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull().default(0),
  category: text("category"),
  accountId: text("account_id").references(() => chartAccount.id),
  receiptFileKey: text("receipt_file_key"),
  receiptFileName: text("receipt_file_name"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const expenseClaimRelations = relations(expenseClaim, ({ one, many }) => ({
  organization: one(organization, { fields: [expenseClaim.organizationId], references: [organization.id] }),
  submittedByUser: one(users, { fields: [expenseClaim.submittedBy], references: [users.id], relationName: "expenseSubmitter" }),
  approvedByUser: one(users, { fields: [expenseClaim.approvedBy], references: [users.id], relationName: "expenseApprover" }),
  journalEntry: one(journalEntry, { fields: [expenseClaim.journalEntryId], references: [journalEntry.id] }),
  items: many(expenseItem),
}));

export const expenseItemRelations = relations(expenseItem, ({ one }) => ({
  expenseClaim: one(expenseClaim, { fields: [expenseItem.expenseClaimId], references: [expenseClaim.id] }),
  account: one(chartAccount, { fields: [expenseItem.accountId], references: [chartAccount.id] }),
}));
