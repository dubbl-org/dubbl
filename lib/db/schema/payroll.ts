import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, member } from "./auth";
import { journalEntry } from "./bookkeeping";
import { project, projectMilestone } from "./projects";

// Enums
export const payFrequencyEnum = pgEnum("pay_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

export const compensationTypeEnum = pgEnum("compensation_type", [
  "salary",
  "hourly",
  "milestone",
  "commission",
]);

export const payrollItemTypeEnum = pgEnum("payroll_item_type", [
  "regular_salary",
  "hourly_pay",
  "overtime",
  "milestone_bonus",
  "project_bonus",
  "commission",
  "deduction",
  "reimbursement",
]);

export const payrollRunStatusEnum = pgEnum("payroll_run_status", [
  "draft",
  "processing",
  "completed",
  "void",
]);

// Payroll Employee
export const payrollEmployee = pgTable("payroll_employee", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => member.id, { onDelete: "set null" }), // link to org member/user
  name: text("name").notNull(),
  email: text("email"),
  employeeNumber: text("employee_number").notNull(),
  position: text("position"),
  compensationType: compensationTypeEnum("compensation_type").notNull().default("salary"),
  salary: integer("salary").notNull(), // cents - annual (for salary type)
  hourlyRate: integer("hourly_rate"), // cents (for hourly type)
  payFrequency: payFrequencyEnum("pay_frequency").notNull().default("monthly"),
  taxRate: integer("tax_rate").notNull().default(2000), // basis points: 2000 = 20.00%
  bankAccountNumber: text("bank_account_number"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Payroll Run
export const payrollRun = pgTable("payroll_run", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  payPeriodStart: date("pay_period_start").notNull(),
  payPeriodEnd: date("pay_period_end").notNull(),
  status: payrollRunStatusEnum("status").notNull().default("draft"),
  totalGross: integer("total_gross").notNull().default(0), // cents
  totalDeductions: integer("total_deductions").notNull().default(0), // cents
  totalNet: integer("total_net").notNull().default(0), // cents
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  processedAt: timestamp("processed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Payroll Item
export const payrollItem = pgTable("payroll_item", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  payrollRunId: uuid("payroll_run_id")
    .notNull()
    .references(() => payrollRun.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id),
  type: payrollItemTypeEnum("type").notNull().default("regular_salary"),
  description: text("description"),
  grossAmount: integer("gross_amount").notNull(), // cents
  taxAmount: integer("tax_amount").notNull(), // cents
  deductions: integer("deductions").notNull().default(0), // cents
  netAmount: integer("net_amount").notNull(), // cents
  projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
  milestoneId: uuid("milestone_id").references(() => projectMilestone.id, { onDelete: "set null" }),
});

// Relations
export const payrollEmployeeRelations = relations(
  payrollEmployee,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [payrollEmployee.organizationId],
      references: [organization.id],
    }),
    member: one(member, {
      fields: [payrollEmployee.memberId],
      references: [member.id],
    }),
    payrollItems: many(payrollItem),
  })
);

export const payrollRunRelations = relations(
  payrollRun,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [payrollRun.organizationId],
      references: [organization.id],
    }),
    journalEntry: one(journalEntry, {
      fields: [payrollRun.journalEntryId],
      references: [journalEntry.id],
    }),
    items: many(payrollItem),
  })
);

export const payrollItemRelations = relations(payrollItem, ({ one }) => ({
  payrollRun: one(payrollRun, {
    fields: [payrollItem.payrollRunId],
    references: [payrollRun.id],
  }),
  employee: one(payrollEmployee, {
    fields: [payrollItem.employeeId],
    references: [payrollEmployee.id],
  }),
  project: one(project, {
    fields: [payrollItem.projectId],
    references: [project.id],
  }),
  milestone: one(projectMilestone, {
    fields: [payrollItem.milestoneId],
    references: [projectMilestone.id],
  }),
}));
