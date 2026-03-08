import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { bankAccount } from "./banking";
import { journalEntry, chartAccount } from "./bookkeeping";

// Enums
export const loanStatusEnum = pgEnum("loan_status", [
  "active",
  "paid_off",
  "defaulted",
]);

// Loan
export const loan = pgTable("loan", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  bankAccountId: uuid("bank_account_id").references(() => bankAccount.id),
  principalAmount: integer("principal_amount").notNull(),
  interestRate: integer("interest_rate").notNull(), // basis points, e.g. 500 = 5%
  termMonths: integer("term_months").notNull(),
  startDate: date("start_date").notNull(),
  monthlyPayment: integer("monthly_payment").notNull(), // cents, calculated PMT
  status: loanStatusEnum("status").notNull().default("active"),
  principalAccountId: uuid("principal_account_id").references(() => chartAccount.id),
  interestAccountId: uuid("interest_account_id").references(() => chartAccount.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Loan Schedule
export const loanSchedule = pgTable("loan_schedule", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  loanId: uuid("loan_id")
    .notNull()
    .references(() => loan.id, { onDelete: "cascade" }),
  periodNumber: integer("period_number").notNull(),
  date: date("date").notNull(),
  principalAmount: integer("principal_amount").notNull(),
  interestAmount: integer("interest_amount").notNull(),
  totalPayment: integer("total_payment").notNull(),
  remainingBalance: integer("remaining_balance").notNull(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  posted: boolean("posted").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const loanRelations = relations(loan, ({ one, many }) => ({
  organization: one(organization, {
    fields: [loan.organizationId],
    references: [organization.id],
  }),
  bankAccount: one(bankAccount, {
    fields: [loan.bankAccountId],
    references: [bankAccount.id],
  }),
  principalAccount: one(chartAccount, {
    fields: [loan.principalAccountId],
    references: [chartAccount.id],
    relationName: "loanPrincipalAccount",
  }),
  interestAccount: one(chartAccount, {
    fields: [loan.interestAccountId],
    references: [chartAccount.id],
    relationName: "loanInterestAccount",
  }),
  scheduleEntries: many(loanSchedule),
}));

export const loanScheduleRelations = relations(loanSchedule, ({ one }) => ({
  loan: one(loan, {
    fields: [loanSchedule.loanId],
    references: [loan.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [loanSchedule.journalEntryId],
    references: [journalEntry.id],
  }),
}));
