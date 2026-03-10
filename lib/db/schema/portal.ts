import {
  pgTable,
  text,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { contact } from "./contacts";

export const portalAccessToken = pgTable("portal_access_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
});

export const portalActivityLog = pgTable("portal_activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id")
    .notNull()
    .references(() => portalAccessToken.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// --- Relations ---

export const portalAccessTokenRelations = relations(portalAccessToken, ({ one, many }) => ({
  organization: one(organization, {
    fields: [portalAccessToken.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [portalAccessToken.contactId],
    references: [contact.id],
  }),
  activityLogs: many(portalActivityLog),
}));

export const portalActivityLogRelations = relations(portalActivityLog, ({ one }) => ({
  token: one(portalAccessToken, {
    fields: [portalActivityLog.tokenId],
    references: [portalAccessToken.id],
  }),
}));
