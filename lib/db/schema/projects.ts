import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users, member, team } from "./auth";
import { contact } from "./contacts";
import { invoice } from "./invoicing";
import { payrollEmployee } from "./payroll";

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
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  contactId: uuid("contact_id").references(() => contact.id),
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
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  role: projectMemberRoleEnum("role").notNull().default("contributor"),
  hourlyRate: integer("hourly_rate"), // cents, null = use project default
  teamAssignmentId: uuid("team_assignment_id"), // tracks which team assignment added this member
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectTeam = pgTable("project_team", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectTeamMember = pgTable("project_team_member", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => projectTeam.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Assign org-level teams to projects
export const projectTeamAssignment = pgTable(
  "project_team_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    defaultRole: projectMemberRoleEnum("default_role").notNull().default("contributor"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("project_team_assignment_unique_idx").on(table.projectId, table.teamId),
  ]
);

// Milestone payment assignments
export const milestoneAssignment = pgTable("milestone_assignment", {
  id: uuid("id").primaryKey().defaultRandom(),
  milestoneId: uuid("milestone_id")
    .notNull()
    .references(() => projectMilestone.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").references(() => payrollEmployee.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => member.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // cents
  description: text("description"),
  isPaid: boolean("is_paid").notNull().default(false),
  payrollItemId: uuid("payroll_item_id"), // set when paid via payroll run
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectTask = pgTable("project_task", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  assigneeId: uuid("assignee_id").references(() => member.id),
  teamId: uuid("team_id").references(() => projectTeam.id),
  createdById: uuid("created_by_id").references(() => users.id),
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
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Subtasks / Checklist items within a task
export const taskChecklist = pgTable("task_checklist", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => projectTask.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Comments on tasks
export const taskComment = pgTable("task_comment", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => projectTask.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectMilestone = pgTable("project_milestone", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
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
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const timeEntry = pgTable("time_entry", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  taskId: uuid("task_id").references(() => projectTask.id),
  date: date("date").notNull(),
  description: text("description"),
  minutes: integer("minutes").notNull().default(0),
  isBillable: boolean("is_billable").notNull().default(true),
  hourlyRate: integer("hourly_rate").notNull().default(0), // cents
  invoiceId: uuid("invoice_id").references(() => invoice.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const runningTimer = pgTable("running_timer", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  startedAt: timestamp("started_at", { mode: "date" }).notNull(),
  pausedAt: timestamp("paused_at", { mode: "date" }),
  accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
  description: text("description"),
  taskId: uuid("task_id").references(() => projectTask.id),
  isBillable: boolean("is_billable").notNull().default(true),
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
  runningTimers: many(runningTimer),
  members: many(projectMember),
  tasks: many(projectTask),
  milestones: many(projectMilestone),
  notes: many(projectNote),
  teams: many(projectTeam),
  labels: many(projectLabel),
  teamAssignments: many(projectTeamAssignment),
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

export const projectMilestoneRelations = relations(projectMilestone, ({ one, many }) => ({
  project: one(project, {
    fields: [projectMilestone.projectId],
    references: [project.id],
  }),
  assignments: many(milestoneAssignment),
}));

export const projectTeamAssignmentRelations = relations(projectTeamAssignment, ({ one }) => ({
  project: one(project, {
    fields: [projectTeamAssignment.projectId],
    references: [project.id],
  }),
  team: one(team, {
    fields: [projectTeamAssignment.teamId],
    references: [team.id],
  }),
}));

export const milestoneAssignmentRelations = relations(milestoneAssignment, ({ one }) => ({
  milestone: one(projectMilestone, {
    fields: [milestoneAssignment.milestoneId],
    references: [projectMilestone.id],
  }),
  employee: one(payrollEmployee, {
    fields: [milestoneAssignment.employeeId],
    references: [payrollEmployee.id],
  }),
  member: one(member, {
    fields: [milestoneAssignment.memberId],
    references: [member.id],
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

export const runningTimerRelations = relations(runningTimer, ({ one }) => ({
  project: one(project, {
    fields: [runningTimer.projectId],
    references: [project.id],
  }),
  user: one(users, {
    fields: [runningTimer.userId],
    references: [users.id],
  }),
  task: one(projectTask, {
    fields: [runningTimer.taskId],
    references: [projectTask.id],
  }),
}));
