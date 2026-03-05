import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { chartAccount, journalEntry } from "./bookkeeping";

// Enums
export const bankTransactionStatusEnum = pgEnum("bank_transaction_status", [
  "unreconciled",
  "reconciled",
  "excluded",
]);

export const bankReconciliationStatusEnum = pgEnum("bank_reconciliation_status", [
  "in_progress",
  "completed",
]);

// Bank Account
export const bankAccount = pgTable("bank_account", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  currencyCode: text("currency_code").notNull().default("USD"),
  chartAccountId: uuid("chart_account_id").references(() => chartAccount.id),
  balance: integer("balance").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Bank Transaction
export const bankTransaction = pgTable("bank_transaction", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  amount: integer("amount").notNull(),
  balance: integer("balance"),
  status: bankTransactionStatusEnum("status").notNull().default("unreconciled"),
  reconciliationId: uuid("reconciliation_id").references(() => bankReconciliation.id),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Bank Reconciliation
export const bankReconciliation = pgTable("bank_reconciliation", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  startBalance: integer("start_balance").notNull().default(0),
  endBalance: integer("end_balance").notNull().default(0),
  status: bankReconciliationStatusEnum("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  organization: one(organization, {
    fields: [bankAccount.organizationId],
    references: [organization.id],
  }),
  chartAccount: one(chartAccount, {
    fields: [bankAccount.chartAccountId],
    references: [chartAccount.id],
  }),
  transactions: many(bankTransaction),
  reconciliations: many(bankReconciliation),
}));

export const bankTransactionRelations = relations(bankTransaction, ({ one }) => ({
  bankAccount: one(bankAccount, {
    fields: [bankTransaction.bankAccountId],
    references: [bankAccount.id],
  }),
  reconciliation: one(bankReconciliation, {
    fields: [bankTransaction.reconciliationId],
    references: [bankReconciliation.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [bankTransaction.journalEntryId],
    references: [journalEntry.id],
  }),
}));

export const bankReconciliationRelations = relations(bankReconciliation, ({ one, many }) => ({
  bankAccount: one(bankAccount, {
    fields: [bankReconciliation.bankAccountId],
    references: [bankAccount.id],
  }),
  transactions: many(bankTransaction),
}));
