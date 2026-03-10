import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
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

export const savedReportRelations = relations(savedReport, ({ one }) => ({
  organization: one(organization, {
    fields: [savedReport.organizationId],
    references: [organization.id],
  }),
}));
