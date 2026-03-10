import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

export const documentFolder = pgTable("document_folder", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => documentFolder.id),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// --- Relations ---

export const documentFolderRelations = relations(documentFolder, ({ one, many }) => ({
  organization: one(organization, {
    fields: [documentFolder.organizationId],
    references: [organization.id],
  }),
  parent: one(documentFolder, {
    fields: [documentFolder.parentId],
    references: [documentFolder.id],
    relationName: "folderParent",
  }),
  children: many(documentFolder, { relationName: "folderParent" }),
  documents: many(document),
}));

export const documentRelations = relations(document, ({ one }) => ({
  organization: one(organization, {
    fields: [document.organizationId],
    references: [organization.id],
  }),
  folder: one(documentFolder, {
    fields: [document.folderId],
    references: [documentFolder.id],
  }),
  uploader: one(users, {
    fields: [document.uploadedBy],
    references: [users.id],
  }),
}));
