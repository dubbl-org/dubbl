import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

export interface ReportConfig {
  dataSource: string;
  filters: { field: string; operator: string; value: string }[];
  groupBy: string[];
  columns: string[];
  dateRange?: { from: string; to: string };
  chartType?: string;
}

export const savedReport = pgTable("saved_report", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").$type<ReportConfig>().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const reportScheduleFrequencyEnum = pgEnum("report_schedule_frequency", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
]);

export const reportScheduleFormatEnum = pgEnum("report_schedule_format", [
  "pdf",
  "csv",
  "xlsx",
]);

export const reportSchedule = pgTable("report_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  savedReportId: uuid("saved_report_id")
    .notNull()
    .references(() => savedReport.id, { onDelete: "cascade" }),
  frequency: reportScheduleFrequencyEnum("frequency").notNull(),
  format: reportScheduleFormatEnum("format").notNull().default("pdf"),
  recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
  dayOfWeek: integer("day_of_week"),
  dayOfMonth: integer("day_of_month"),
  timeOfDay: text("time_of_day").notNull().default("08:00"),
  timezone: text("timezone").notNull().default("UTC"),
  isActive: boolean("is_active").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { mode: "date" }),
  lastRunAt: timestamp("last_run_at", { mode: "date" }),
  lastRunStatus: text("last_run_status"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// --- Relations ---

export const savedReportRelations = relations(savedReport, ({ one, many }) => ({
  organization: one(organization, {
    fields: [savedReport.organizationId],
    references: [organization.id],
  }),
  schedules: many(reportSchedule),
}));

export const reportScheduleRelations = relations(reportSchedule, ({ one }) => ({
  organization: one(organization, {
    fields: [reportSchedule.organizationId],
    references: [organization.id],
  }),
  savedReport: one(savedReport, {
    fields: [reportSchedule.savedReportId],
    references: [savedReport.id],
  }),
}));
