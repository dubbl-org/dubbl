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
import { organization, member } from "./auth";

// Enums
export const approvalEntityTypeEnum = pgEnum("approval_entity_type", [
  "bill",
  "expense",
  "invoice",
  "journal_entry",
  "purchase_order",
]);

export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const approvalActionTypeEnum = pgEnum("approval_action_type", [
  "approve",
  "reject",
  "comment",
]);

// Tables
export const approvalWorkflow = pgTable("approval_workflow", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  entityType: approvalEntityTypeEnum("entity_type").notNull(),
  conditions: jsonb("conditions")
    .$type<{ field: string; operator: string; value: string }[]>()
    .notNull()
    .default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const approvalWorkflowStep = pgTable("approval_workflow_step", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => approvalWorkflow.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  approverId: uuid("approver_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  isRequired: boolean("is_required").notNull().default(true),
});

export const approvalRequest = pgTable("approval_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => approvalWorkflow.id),
  entityType: approvalEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  status: approvalRequestStatusEnum("status").notNull().default("pending"),
  currentStepOrder: integer("current_step_order").notNull().default(1),
  requestedById: uuid("requested_by_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const approvalAction = pgTable("approval_action", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => approvalRequest.id, { onDelete: "cascade" }),
  stepId: uuid("step_id")
    .notNull()
    .references(() => approvalWorkflowStep.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  action: approvalActionTypeEnum("action").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const approvalWorkflowRelations = relations(
  approvalWorkflow,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [approvalWorkflow.organizationId],
      references: [organization.id],
    }),
    steps: many(approvalWorkflowStep),
    requests: many(approvalRequest),
  })
);

export const approvalWorkflowStepRelations = relations(
  approvalWorkflowStep,
  ({ one }) => ({
    workflow: one(approvalWorkflow, {
      fields: [approvalWorkflowStep.workflowId],
      references: [approvalWorkflow.id],
    }),
    approver: one(member, {
      fields: [approvalWorkflowStep.approverId],
      references: [member.id],
    }),
  })
);

export const approvalRequestRelations = relations(
  approvalRequest,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [approvalRequest.organizationId],
      references: [organization.id],
    }),
    workflow: one(approvalWorkflow, {
      fields: [approvalRequest.workflowId],
      references: [approvalWorkflow.id],
    }),
    requestedBy: one(member, {
      fields: [approvalRequest.requestedById],
      references: [member.id],
    }),
    actions: many(approvalAction),
  })
);

export const approvalActionRelations = relations(
  approvalAction,
  ({ one }) => ({
    request: one(approvalRequest, {
      fields: [approvalAction.requestId],
      references: [approvalRequest.id],
    }),
    step: one(approvalWorkflowStep, {
      fields: [approvalAction.stepId],
      references: [approvalWorkflowStep.id],
    }),
    user: one(member, {
      fields: [approvalAction.userId],
      references: [member.id],
    }),
  })
);
