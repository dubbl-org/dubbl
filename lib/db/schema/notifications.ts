import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

export const notificationTypeEnum = pgEnum("notification_type", [
  "invoice_overdue",
  "payment_received",
  "inventory_low",
  "payroll_due",
  "approval_needed",
  "system_alert",
  "task_assigned",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "email",
]);

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  channel: notificationChannelEnum("channel").notNull().default("in_app"),
  readAt: timestamp("read_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const notificationPreference = pgTable("notification_preference", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  channel: notificationChannelEnum("channel").notNull().default("in_app"),
  enabled: boolean("enabled").notNull().default(true),
  digestIntervalMinutes: integer("digest_interval_minutes").notNull().default(30), // 0 = immediate
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Queue for batching email notifications into digests
export const notificationDigestQueue = pgTable("notification_digest_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notificationId: uuid("notification_id")
    .notNull()
    .references(() => notification.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { mode: "date" }),
});

// --- Relations ---

export const notificationRelations = relations(notification, ({ one }) => ({
  organization: one(organization, {
    fields: [notification.organizationId],
    references: [organization.id],
  }),
  user: one(users, {
    fields: [notification.userId],
    references: [users.id],
  }),
}));

export const notificationPreferenceRelations = relations(
  notificationPreference,
  ({ one }) => ({
    organization: one(organization, {
      fields: [notificationPreference.organizationId],
      references: [organization.id],
    }),
    user: one(users, {
      fields: [notificationPreference.userId],
      references: [users.id],
    }),
  })
);

export const notificationDigestQueueRelations = relations(
  notificationDigestQueue,
  ({ one }) => ({
    organization: one(organization, {
      fields: [notificationDigestQueue.organizationId],
      references: [organization.id],
    }),
    user: one(users, {
      fields: [notificationDigestQueue.userId],
      references: [users.id],
    }),
    notification: one(notification, {
      fields: [notificationDigestQueue.notificationId],
      references: [notification.id],
    }),
  })
);
