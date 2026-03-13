import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

// Individual email invitations
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // "admin" | "member"
    token: text("token").notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invitation_org_email_idx").on(
      table.organizationId,
      table.email
    ),
  ]
);

// Shareable org invite links
export const orgInviteLink = pgTable("org_invite_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  defaultRole: text("default_role").notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  maxUses: integer("max_uses"), // null = unlimited
  useCount: integer("use_count").notNull().default(0),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { mode: "date" }), // null = never expires
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  invitedBy: one(users, {
    fields: [invitation.invitedById],
    references: [users.id],
    relationName: "invitedBy",
  }),
  acceptedByUser: one(users, {
    fields: [invitation.acceptedByUserId],
    references: [users.id],
    relationName: "acceptedBy",
  }),
}));

export const orgInviteLinkRelations = relations(orgInviteLink, ({ one }) => ({
  organization: one(organization, {
    fields: [orgInviteLink.organizationId],
    references: [organization.id],
  }),
  createdBy: one(users, {
    fields: [orgInviteLink.createdById],
    references: [users.id],
  }),
}));
