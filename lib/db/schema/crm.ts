import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  pgEnum,
  jsonb,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";
import { contact } from "./contacts";

export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
]);

export const dealSourceEnum = pgEnum("deal_source", [
  "website",
  "referral",
  "cold_outreach",
  "event",
  "other",
]);

export const dealActivityTypeEnum = pgEnum("deal_activity_type", [
  "note",
  "email",
  "call",
  "meeting",
  "task",
]);

export interface PipelineStageConfig {
  id: string;
  name: string;
  color: string;
}

export const pipeline = pgTable("pipeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stages: jsonb("stages").$type<PipelineStageConfig[]>().notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const deal = pgTable("deal", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  pipelineId: uuid("pipeline_id")
    .notNull()
    .references(() => pipeline.id),
  stageId: text("stage_id").notNull(),
  contactId: uuid("contact_id").references(() => contact.id),
  title: text("title").notNull(),
  valueCents: integer("value_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  probability: integer("probability").default(0),
  expectedCloseDate: date("expected_close_date"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  source: dealSourceEnum("source"),
  notes: text("notes"),
  wonAt: timestamp("won_at", { mode: "date" }),
  lostAt: timestamp("lost_at", { mode: "date" }),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const dealActivity = pgTable("deal_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deal.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  type: dealActivityTypeEnum("type").notNull(),
  content: text("content"),
  scheduledAt: timestamp("scheduled_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// --- Relations ---

export const pipelineRelations = relations(pipeline, ({ one, many }) => ({
  organization: one(organization, {
    fields: [pipeline.organizationId],
    references: [organization.id],
  }),
  deals: many(deal),
}));

export const dealRelations = relations(deal, ({ one, many }) => ({
  organization: one(organization, {
    fields: [deal.organizationId],
    references: [organization.id],
  }),
  pipeline: one(pipeline, {
    fields: [deal.pipelineId],
    references: [pipeline.id],
  }),
  contact: one(contact, {
    fields: [deal.contactId],
    references: [contact.id],
  }),
  assignedUser: one(users, {
    fields: [deal.assignedTo],
    references: [users.id],
  }),
  activities: many(dealActivity),
}));

export const dealActivityRelations = relations(dealActivity, ({ one }) => ({
  deal: one(deal, {
    fields: [dealActivity.dealId],
    references: [deal.id],
  }),
  user: one(users, {
    fields: [dealActivity.userId],
    references: [users.id],
  }),
}));
