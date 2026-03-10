import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

export const workflowTriggerEnum = pgEnum("workflow_trigger", [
  "invoice_created",
  "invoice_overdue",
  "payment_received",
  "contact_created",
  "inventory_low",
  "deal_stage_changed",
  "payroll_processed",
]);

export const workflowActionEnum = pgEnum("workflow_action", [
  "send_notification",
  "send_email",
  "create_task",
  "update_field",
  "move_deal_stage",
  "create_invoice",
]);

export interface WorkflowCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";
  value: string;
}

export interface WorkflowAction {
  type: string;
  config: Record<string, unknown>;
}

export const workflow = pgTable("workflow", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  trigger: workflowTriggerEnum("trigger").notNull(),
  conditions: jsonb("conditions").$type<WorkflowCondition[]>().notNull().default([]),
  actions: jsonb("actions").$type<WorkflowAction[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { mode: "date" }),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const workflowExecutionLog = pgTable("workflow_execution_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflow.id, { onDelete: "cascade" }),
  triggeredByType: text("triggered_by_type").notNull(),
  triggeredById: text("triggered_by_id").notNull(),
  status: text("status").notNull().default("success"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  executedAt: timestamp("executed_at", { mode: "date" }).defaultNow().notNull(),
});

// --- Relations ---

export const workflowRelations = relations(workflow, ({ one, many }) => ({
  organization: one(organization, {
    fields: [workflow.organizationId],
    references: [organization.id],
  }),
  logs: many(workflowExecutionLog),
}));

export const workflowExecutionLogRelations = relations(workflowExecutionLog, ({ one }) => ({
  workflow: one(workflow, {
    fields: [workflowExecutionLog.workflowId],
    references: [workflow.id],
  }),
}));
