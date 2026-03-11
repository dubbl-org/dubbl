import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

export const advisorRoleEnum = pgEnum("advisor_role", [
  "accountant",
  "auditor",
  "tax_advisor",
  "bookkeeper",
]);

// Advisor Access - grants an external user advisor-level access to an organization
export const advisorAccess = pgTable(
  "advisor_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorUserId: uuid("advisor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: advisorRoleEnum("role").notNull().default("accountant"),
    isActive: boolean("is_active").notNull().default(true),
    inviteEmail: text("invite_email"), // email used for the invitation
    grantedBy: uuid("granted_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { mode: "date" }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("advisor_access_user_org_idx").on(
      table.advisorUserId,
      table.organizationId
    ),
  ]
);

// Advisor Audit Log - tracks advisor actions for compliance
export const advisorAuditLog = pgTable("advisor_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  advisorAccessId: uuid("advisor_access_id")
    .notNull()
    .references(() => advisorAccess.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // "view_report", "create_entry", "set_lock", etc.
  entityType: text("entity_type"), // "journal_entry", "invoice", "report", etc.
  entityId: uuid("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const advisorAccessRelations = relations(advisorAccess, ({ one, many }) => ({
  advisorUser: one(users, {
    fields: [advisorAccess.advisorUserId],
    references: [users.id],
    relationName: "advisorUser",
  }),
  organization: one(organization, {
    fields: [advisorAccess.organizationId],
    references: [organization.id],
  }),
  grantedByUser: one(users, {
    fields: [advisorAccess.grantedBy],
    references: [users.id],
    relationName: "advisorGranter",
  }),
  auditLogs: many(advisorAuditLog),
}));

export const advisorAuditLogRelations = relations(advisorAuditLog, ({ one }) => ({
  advisorAccess: one(advisorAccess, {
    fields: [advisorAuditLog.advisorAccessId],
    references: [advisorAccess.id],
  }),
}));
