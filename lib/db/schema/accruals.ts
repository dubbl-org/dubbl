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
import { organization, users } from "./auth";
import { journalEntry, chartAccount } from "./bookkeeping";

// Enums
export const accrualFrequencyEnum = pgEnum("accrual_frequency", ["monthly"]);

export const accrualStatusEnum = pgEnum("accrual_status", [
  "active",
  "completed",
  "cancelled",
]);

// Accrual Schedule
export const accrualSchedule = pgTable("accrual_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  sourceEntryId: uuid("source_entry_id").references(() => journalEntry.id),
  totalAmount: integer("total_amount").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  frequency: accrualFrequencyEnum("frequency").notNull().default("monthly"),
  periods: integer("periods").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => chartAccount.id),
  reverseAccountId: uuid("reverse_account_id")
    .notNull()
    .references(() => chartAccount.id),
  description: text("description").notNull(),
  status: accrualStatusEnum("status").notNull().default("active"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Accrual Entry
export const accrualEntry = pgTable("accrual_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => accrualSchedule.id, { onDelete: "cascade" }),
  periodDate: date("period_date").notNull(),
  amount: integer("amount").notNull(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  posted: boolean("posted").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const accrualScheduleRelations = relations(
  accrualSchedule,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [accrualSchedule.organizationId],
      references: [organization.id],
    }),
    sourceEntry: one(journalEntry, {
      fields: [accrualSchedule.sourceEntryId],
      references: [journalEntry.id],
    }),
    account: one(chartAccount, {
      fields: [accrualSchedule.accountId],
      references: [chartAccount.id],
    }),
    reverseAccount: one(chartAccount, {
      fields: [accrualSchedule.reverseAccountId],
      references: [chartAccount.id],
      relationName: "reverseAccount",
    }),
    createdByUser: one(users, {
      fields: [accrualSchedule.createdBy],
      references: [users.id],
    }),
    entries: many(accrualEntry),
  })
);

export const accrualEntryRelations = relations(accrualEntry, ({ one }) => ({
  schedule: one(accrualSchedule, {
    fields: [accrualEntry.scheduleId],
    references: [accrualSchedule.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [accrualEntry.journalEntryId],
    references: [journalEntry.id],
  }),
}));
