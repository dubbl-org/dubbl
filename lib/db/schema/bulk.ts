import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

export const bulkImportStatusEnum = pgEnum("bulk_import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const bulkImportJob = pgTable("bulk_import_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "contacts", "accounts", "invoices"
  status: bulkImportStatusEnum("status").notNull().default("pending"),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  errorDetails: jsonb("error_details").$type<Array<{ row: number; error: string }>>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const bulkImportJobRelations = relations(bulkImportJob, ({ one }) => ({
  organization: one(organization, {
    fields: [bulkImportJob.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(users, {
    fields: [bulkImportJob.createdBy],
    references: [users.id],
  }),
}));
