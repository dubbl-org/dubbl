import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";
import { organization, users, member } from "./auth";
import { contact } from "./contacts";
import { invoice } from "./invoicing";

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "completed",
  "on_hold",
  "cancelled",
  "archived",
]);

export const projectPriorityEnum = pgEnum("project_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const projectBillingTypeEnum = pgEnum("project_billing_type", [
  "hourly",
  "fixed",
  "milestone",
  "non_billable",
]);

export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "manager",
  "contributor",
  "viewer",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "upcoming",
  "in_progress",
  "completed",
  "overdue",
]);

export const project = pgTable("project", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  contactId: text("contact_id").references(() => contact.id),
  status: projectStatusEnum("status").notNull().default("active"),
  priority: projectPriorityEnum("priority").notNull().default("medium"),
  billingType: projectBillingTypeEnum("billing_type").notNull().default("hourly"),
  color: text("color").notNull().default("#10b981"),
  // Financial
  budget: integer("budget").notNull().default(0), // cents
  hourlyRate: integer("hourly_rate").notNull().default(0), // cents
  fixedPrice: integer("fixed_price").notNull().default(0), // cents (for fixed billing)
  totalHours: integer("total_hours").notNull().default(0), // minutes
  totalBilled: integer("total_billed").notNull().default(0), // cents
  estimatedHours: integer("estimated_hours").notNull().default(0), // minutes
  currency: text("currency").notNull().default("USD"),
  // Timeline
  startDate: date("start_date"),
  endDate: date("end_date"),
  // Categorization
  category: text("category"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // Settings (what's enabled for this project)
  enableTimeline: boolean("enable_timeline").notNull().default(true),
  enableTasks: boolean("enable_tasks").notNull().default(true),
  enableTimeTracking: boolean("enable_time_tracking").notNull().default(true),
  enableMilestones: boolean("enable_milestones").notNull().default(false),
  enableNotes: boolean("enable_notes").notNull().default(true),
  enableBilling: boolean("enable_billing").notNull().default(true),
  // Metadata
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const projectMember = pgTable("project_member", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  role: projectMemberRoleEnum("role").notNull().default("contributor"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectTeam = pgTable("project_team", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectTeamMember = pgTable("project_team_member", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  teamId: text("team_id")
    .notNull()
    .references(() => projectTeam.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectTask = pgTable("project_task", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  assigneeId: text("assignee_id").references(() => member.id),
  teamId: text("team_id").references(() => projectTeam.id),
  createdById: text("created_by_id").references(() => users.id),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  estimatedMinutes: integer("estimated_minutes"),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Labels defined at project level
export const projectLabel = pgTable("project_label", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Subtasks / Checklist items within a task
export const taskChecklist = pgTable("task_checklist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  taskId: text("task_id")
    .notNull()
    .references(() => projectTask.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Comments on tasks
export const taskComment = pgTable("task_comment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  taskId: text("task_id")
    .notNull()
    .references(() => projectTask.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectMilestone = pgTable("project_milestone", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: milestoneStatusEnum("status").notNull().default("upcoming"),
  dueDate: date("due_date"),
  amount: integer("amount").notNull().default(0), // cents (for milestone billing)
  completedAt: timestamp("completed_at", { mode: "date" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectNote = pgTable("project_note", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const timeEntry = pgTable("time_entry", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  taskId: text("task_id").references(() => projectTask.id),
  date: date("date").notNull(),
  description: text("description"),
  minutes: integer("minutes").notNull().default(0),
  isBillable: boolean("is_billable").notNull().default(true),
  hourlyRate: integer("hourly_rate").notNull().default(0), // cents
  invoiceId: text("invoice_id").references(() => invoice.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const projectRelations = relations(project, ({ one, many }) => ({
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [project.contactId],
    references: [contact.id],
  }),
  timeEntries: many(timeEntry),
  members: many(projectMember),
  tasks: many(projectTask),
  milestones: many(projectMilestone),
  notes: many(projectNote),
  teams: many(projectTeam),
  labels: many(projectLabel),
}));

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
  project: one(project, {
    fields: [projectMember.projectId],
    references: [project.id],
  }),
  member: one(member, {
    fields: [projectMember.memberId],
    references: [member.id],
  }),
}));

export const projectTeamRelations = relations(projectTeam, ({ one, many }) => ({
  project: one(project, {
    fields: [projectTeam.projectId],
    references: [project.id],
  }),
  members: many(projectTeamMember),
}));

export const projectTeamMemberRelations = relations(projectTeamMember, ({ one }) => ({
  team: one(projectTeam, {
    fields: [projectTeamMember.teamId],
    references: [projectTeam.id],
  }),
  member: one(member, {
    fields: [projectTeamMember.memberId],
    references: [member.id],
  }),
}));

export const projectLabelRelations = relations(projectLabel, ({ one }) => ({
  project: one(project, {
    fields: [projectLabel.projectId],
    references: [project.id],
  }),
}));

export const projectTaskRelations = relations(projectTask, ({ one, many }) => ({
  project: one(project, {
    fields: [projectTask.projectId],
    references: [project.id],
  }),
  assignee: one(member, {
    fields: [projectTask.assigneeId],
    references: [member.id],
  }),
  team: one(projectTeam, {
    fields: [projectTask.teamId],
    references: [projectTeam.id],
  }),
  createdBy: one(users, {
    fields: [projectTask.createdById],
    references: [users.id],
  }),
  checklist: many(taskChecklist),
  comments: many(taskComment),
}));

export const taskChecklistRelations = relations(taskChecklist, ({ one }) => ({
  task: one(projectTask, {
    fields: [taskChecklist.taskId],
    references: [projectTask.id],
  }),
}));

export const taskCommentRelations = relations(taskComment, ({ one }) => ({
  task: one(projectTask, {
    fields: [taskComment.taskId],
    references: [projectTask.id],
  }),
  author: one(users, {
    fields: [taskComment.authorId],
    references: [users.id],
  }),
}));

export const projectMilestoneRelations = relations(projectMilestone, ({ one }) => ({
  project: one(project, {
    fields: [projectMilestone.projectId],
    references: [project.id],
  }),
}));

export const projectNoteRelations = relations(projectNote, ({ one }) => ({
  project: one(project, {
    fields: [projectNote.projectId],
    references: [project.id],
  }),
  author: one(users, {
    fields: [projectNote.authorId],
    references: [users.id],
  }),
}));

export const timeEntryRelations = relations(timeEntry, ({ one }) => ({
  project: one(project, {
    fields: [timeEntry.projectId],
    references: [project.id],
  }),
  user: one(users, {
    fields: [timeEntry.userId],
    references: [users.id],
  }),
  task: one(projectTask, {
    fields: [timeEntry.taskId],
    references: [projectTask.id],
  }),
  invoice: one(invoice, {
    fields: [timeEntry.invoiceId],
    references: [invoice.id],
  }),
}));
