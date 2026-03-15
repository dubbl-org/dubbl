import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { users } from "./auth";
import { relations } from "drizzle-orm";

export const dataBackup = pgTable("data_backup", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<"scheduled" | "manual" | "uploaded">(),
  status: text("status").notNull().$type<"pending" | "completed" | "failed">(),
  fileKey: text("file_key"),
  sizeBytes: integer("size_bytes"),
  entityCounts: jsonb("entity_counts").$type<Record<string, number>>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const dataBackupRelations = relations(dataBackup, ({ one }) => ({
  organization: one(organization, {
    fields: [dataBackup.organizationId],
    references: [organization.id],
  }),
}));
