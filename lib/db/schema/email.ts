import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

// Enums
export const reminderTriggerTypeEnum = pgEnum("reminder_trigger_type", [
  "before_due",
  "on_due",
  "after_due",
]);

export const reminderDocumentTypeEnum = pgEnum("reminder_document_type", [
  "invoice",
  "bill",
]);

export const reminderRecipientTypeEnum = pgEnum("reminder_recipient_type", [
  "contact_email",
  "contact_persons",
  "custom",
]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "sent",
  "failed",
  "skipped",
]);

// Email Config - one per org, SMTP settings
export const emailConfig = pgTable("email_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUsername: text("smtp_username").notNull(),
  smtpPassword: text("smtp_password").notNull(), // stored encrypted
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  replyTo: text("reply_to"),
  useTls: boolean("use_tls").notNull().default(true),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_config_org_idx").on(table.organizationId),
]);

// Reminder Rule - configurable reminder schedules
export const reminderRule = pgTable("reminder_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: reminderTriggerTypeEnum("trigger_type").notNull(),
  triggerDays: integer("trigger_days").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  subjectTemplate: text("subject_template").notNull(),
  bodyTemplate: text("body_template").notNull(),
  documentType: reminderDocumentTypeEnum("document_type").notNull(),
  recipientType: reminderRecipientTypeEnum("recipient_type").notNull(),
  customEmails: jsonb("custom_emails").$type<string[]>(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Reminder Log - tracks sent reminders
export const reminderLog = pgTable("reminder_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  reminderRuleId: uuid("reminder_rule_id").references(() => reminderRule.id),
  documentType: text("document_type").notNull(),
  documentId: uuid("document_id").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  status: reminderStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const emailConfigRelations = relations(emailConfig, ({ one }) => ({
  organization: one(organization, {
    fields: [emailConfig.organizationId],
    references: [organization.id],
  }),
}));

export const reminderRuleRelations = relations(reminderRule, ({ one }) => ({
  organization: one(organization, {
    fields: [reminderRule.organizationId],
    references: [organization.id],
  }),
}));

export const reminderLogRelations = relations(reminderLog, ({ one }) => ({
  organization: one(organization, {
    fields: [reminderLog.organizationId],
    references: [organization.id],
  }),
  reminderRule: one(reminderRule, {
    fields: [reminderLog.reminderRuleId],
    references: [reminderRule.id],
  }),
}));
