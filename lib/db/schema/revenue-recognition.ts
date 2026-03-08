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
import { journalEntry } from "./bookkeeping";
import { invoice, invoiceLine } from "./invoicing";

// Enums
export const revenueMethodEnum = pgEnum("revenue_method", [
  "straight_line",
  "milestone",
  "on_completion",
]);

export const revenueStatusEnum = pgEnum("revenue_status", [
  "active",
  "completed",
  "cancelled",
]);

// Revenue Schedule
export const revenueSchedule = pgTable("revenue_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id),
  invoiceLineId: uuid("invoice_line_id").references(() => invoiceLine.id),
  totalAmount: integer("total_amount").notNull(),
  recognizedAmount: integer("recognized_amount").notNull().default(0),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  method: revenueMethodEnum("method").notNull().default("straight_line"),
  status: revenueStatusEnum("status").notNull().default("active"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Revenue Entry
export const revenueEntry = pgTable("revenue_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => revenueSchedule.id, { onDelete: "cascade" }),
  periodDate: date("period_date").notNull(),
  amount: integer("amount").notNull(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  recognized: boolean("recognized").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const revenueScheduleRelations = relations(
  revenueSchedule,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [revenueSchedule.organizationId],
      references: [organization.id],
    }),
    invoice: one(invoice, {
      fields: [revenueSchedule.invoiceId],
      references: [invoice.id],
    }),
    entries: many(revenueEntry),
  })
);

export const revenueEntryRelations = relations(revenueEntry, ({ one }) => ({
  schedule: one(revenueSchedule, {
    fields: [revenueEntry.scheduleId],
    references: [revenueSchedule.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [revenueEntry.journalEntryId],
    references: [journalEntry.id],
  }),
}));
