import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
  real,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, member } from "./auth";
import { journalEntry } from "./bookkeeping";
import { project, projectMilestone } from "./projects";

// ─── Existing Enums ─────────────────────────────────────────────────
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
  "pending_approval",
]);

// ─── New Enums ──────────────────────────────────────────────────────
export const deductionCategoryEnum = pgEnum("deduction_category", [
  "pre_tax",
  "post_tax",
]);

export const deductionTimingEnum = pgEnum("deduction_timing", [
  "recurring",
  "one_time",
]);

export const bonusTypeEnum = pgEnum("bonus_type", [
  "performance",
  "signing",
  "referral",
  "holiday",
  "spot",
  "retention",
  "other",
]);

export const runTypeEnum = pgEnum("run_type", [
  "regular",
  "off_cycle",
  "termination",
  "bonus_only",
  "correction",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const timesheetStatusEnum = pgEnum("timesheet_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);

export const contractorPaymentStatusEnum = pgEnum("contractor_payment_status", [
  "pending",
  "paid",
  "void",
]);

export const leaveTypeEnum = pgEnum("leave_type", [
  "vacation",
  "sick",
  "personal",
  "parental",
  "bereavement",
  "unpaid",
  "other",
]);

export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const accrualMethodEnum = pgEnum("accrual_method", [
  "per_pay_period",
  "monthly",
  "annually",
  "front_loaded",
]);

export const taxJurisdictionLevelEnum = pgEnum("tax_jurisdiction_level", [
  "federal",
  "state",
  "local",
]);

export const filingStatusEnum = pgEnum("filing_status", [
  "single",
  "married_joint",
  "married_separate",
  "head_of_household",
]);

export const shiftTypeEnum = pgEnum("shift_type", [
  "regular",
  "overtime",
  "night",
  "weekend",
  "holiday",
]);

export const compensationReviewStatusEnum = pgEnum("compensation_review_status", [
  "draft",
  "in_progress",
  "completed",
  "cancelled",
]);

export const payslipStatusEnum = pgEnum("payslip_status", [
  "generated",
  "sent",
  "viewed",
]);

// ─── Payroll Settings (one per org) ─────────────────────────────────
export const payrollSettings = pgTable("payroll_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  defaultTaxRate: integer("default_tax_rate").notNull().default(2000), // basis points
  overtimeThresholdHours: real("overtime_threshold_hours").notNull().default(40),
  overtimeMultiplier: real("overtime_multiplier").notNull().default(1.5),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  salaryExpenseAccountCode: text("salary_expense_account_code").default("5100"),
  taxPayableAccountCode: text("tax_payable_account_code").default("2200"),
  bankAccountCode: text("bank_account_code").default("1100"),
  autoApprovalEnabled: boolean("auto_approval_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Payroll Employee (expanded) ────────────────────────────────────
export const payrollEmployee = pgTable("payroll_employee", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => member.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email"),
  employeeNumber: text("employee_number").notNull(),
  position: text("position"),
  department: text("department"),
  compensationType: compensationTypeEnum("compensation_type").notNull().default("salary"),
  salary: integer("salary").notNull(), // cents - annual
  hourlyRate: integer("hourly_rate"), // cents
  payFrequency: payFrequencyEnum("pay_frequency").notNull().default("monthly"),
  taxRate: integer("tax_rate").notNull().default(2000), // basis points
  bankAccountNumber: text("bank_account_number"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  terminationDate: date("termination_date"),
  terminationReason: text("termination_reason"),
  ptoBalanceHours: real("pto_balance_hours").notNull().default(0),
  currency: text("currency").default("USD"),
  compensationBandId: uuid("compensation_band_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// ─── Payroll Run (expanded) ─────────────────────────────────────────
export const payrollRun = pgTable("payroll_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  payPeriodStart: date("pay_period_start").notNull(),
  payPeriodEnd: date("pay_period_end").notNull(),
  status: payrollRunStatusEnum("status").notNull().default("draft"),
  runType: runTypeEnum("run_type").notNull().default("regular"),
  parentRunId: uuid("parent_run_id"),
  notes: text("notes"),
  approvalStatus: approvalStatusEnum("approval_status"),
  approvedBy: uuid("approved_by").references(() => member.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  totalGross: integer("total_gross").notNull().default(0), // cents
  totalDeductions: integer("total_deductions").notNull().default(0), // cents
  totalNet: integer("total_net").notNull().default(0), // cents
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  processedAt: timestamp("processed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// ─── Payroll Item (expanded) ────────────────────────────────────────
export const payrollItem = pgTable("payroll_item", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  overtimeHours: real("overtime_hours"),
  overtimeAmount: integer("overtime_amount"), // cents
  bonusAmount: integer("bonus_amount"), // cents
  preTaxDeductions: integer("pre_tax_deductions").default(0), // cents
  postTaxDeductions: integer("post_tax_deductions").default(0), // cents
  timesheetId: uuid("timesheet_id"),
  currency: text("currency").default("USD"),
  fxRate: real("fx_rate").default(1),
  projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
  milestoneId: uuid("milestone_id").references(() => projectMilestone.id, { onDelete: "set null" }),
});

// ─── Deduction Types ────────────────────────────────────────────────
export const deductionType = pgTable("deduction_type", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: deductionCategoryEnum("category").notNull().default("post_tax"),
  defaultAmount: integer("default_amount"), // cents (fixed amount)
  defaultPercent: real("default_percent"), // percentage of gross
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// ─── Employee Deductions ────────────────────────────────────────────
export const employeeDeduction = pgTable("employee_deduction", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id, { onDelete: "cascade" }),
  deductionTypeId: uuid("deduction_type_id")
    .notNull()
    .references(() => deductionType.id),
  timing: deductionTimingEnum("timing").notNull().default("recurring"),
  amount: integer("amount"), // cents - override
  percent: real("percent"), // override
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// ─── Payroll Item Deductions (breakdown per item) ───────────────────
export const payrollItemDeduction = pgTable("payroll_item_deduction", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollItemId: uuid("payroll_item_id")
    .notNull()
    .references(() => payrollItem.id, { onDelete: "cascade" }),
  deductionTypeId: uuid("deduction_type_id")
    .notNull()
    .references(() => deductionType.id),
  amount: integer("amount").notNull(), // cents
  category: deductionCategoryEnum("category").notNull(),
});

// ─── Payroll Bonuses ────────────────────────────────────────────────
export const payrollBonus = pgTable("payroll_bonus", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollRunId: uuid("payroll_run_id")
    .notNull()
    .references(() => payrollRun.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id),
  bonusType: bonusTypeEnum("bonus_type").notNull(),
  amount: integer("amount").notNull(), // cents
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Payroll Item Overtime ──────────────────────────────────────────
export const payrollItemOvertime = pgTable("payroll_item_overtime", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollItemId: uuid("payroll_item_id")
    .notNull()
    .references(() => payrollItem.id, { onDelete: "cascade" }),
  regularHours: real("regular_hours").notNull(),
  overtimeHours: real("overtime_hours").notNull(),
  overtimeMultiplier: real("overtime_multiplier").notNull().default(1.5),
  regularAmount: integer("regular_amount").notNull(), // cents
  overtimeAmount: integer("overtime_amount").notNull(), // cents
});

// ─── Approval Chain ─────────────────────────────────────────────────
export const approvalChain = pgTable("approval_chain", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const approvalChainStep = pgTable("approval_chain_step", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => approvalChain.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  approverId: uuid("approver_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
});

export const approvalRecord = pgTable("approval_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollRunId: uuid("payroll_run_id")
    .notNull()
    .references(() => payrollRun.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").references(() => approvalChainStep.id),
  approverId: uuid("approver_id")
    .notNull()
    .references(() => member.id),
  status: approvalStatusEnum("status").notNull().default("pending"),
  comment: text("comment"),
  decidedAt: timestamp("decided_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Timesheets ─────────────────────────────────────────────────────
export const timesheet = pgTable("timesheet", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: timesheetStatusEnum("status").notNull().default("draft"),
  totalHours: real("total_hours").notNull().default(0),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  approvedBy: uuid("approved_by").references(() => member.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const timesheetEntry = pgTable("timesheet_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  timesheetId: uuid("timesheet_id")
    .notNull()
    .references(() => timesheet.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  hours: real("hours").notNull(),
  shiftType: shiftTypeEnum("shift_type").notNull().default("regular"),
  description: text("description"),
  projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
});

// ─── Contractors ────────────────────────────────────────────────────
export const contractor = pgTable("contractor", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  company: text("company"),
  taxId: text("tax_id"),
  hourlyRate: integer("hourly_rate"), // cents
  currency: text("currency").default("USD"),
  bankAccountNumber: text("bank_account_number"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const contractorPayment = pgTable("contractor_payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorId: uuid("contractor_id")
    .notNull()
    .references(() => contractor.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // cents
  currency: text("currency").default("USD"),
  description: text("description"),
  invoiceNumber: text("invoice_number"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  status: contractorPaymentStatusEnum("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { mode: "date" }),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Leave / PTO ────────────────────────────────────────────────────
export const leavePolicy = pgTable("leave_policy", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  leaveType: leaveTypeEnum("leave_type").notNull(),
  accrualMethod: accrualMethodEnum("accrual_method").notNull().default("per_pay_period"),
  accrualRate: real("accrual_rate").notNull().default(0), // hours per period
  maxBalance: real("max_balance"), // max hours that can be banked
  carryOverMax: real("carry_over_max"), // max hours carried to next year
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const employeeLeaveBalance = pgTable("employee_leave_balance", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id, { onDelete: "cascade" }),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => leavePolicy.id, { onDelete: "cascade" }),
  balance: real("balance").notNull().default(0), // hours
  usedHours: real("used_hours").notNull().default(0),
  year: integer("year").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const leaveRequest = pgTable("leave_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id, { onDelete: "cascade" }),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => leavePolicy.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  hours: real("hours").notNull(),
  reason: text("reason"),
  status: leaveRequestStatusEnum("status").notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => member.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Compensation Bands & Reviews ───────────────────────────────────
export const compensationBand = pgTable("compensation_band", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  level: text("level"), // e.g. "L3", "Senior"
  minSalary: integer("min_salary").notNull(), // cents
  midSalary: integer("mid_salary").notNull(), // cents
  maxSalary: integer("max_salary").notNull(), // cents
  currency: text("currency").default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const compensationReview = pgTable("compensation_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  effectiveDate: date("effective_date").notNull(),
  status: compensationReviewStatusEnum("status").notNull().default("draft"),
  totalBudget: integer("total_budget"), // cents
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const compensationReviewEntry = pgTable("compensation_review_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => compensationReview.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id),
  currentSalary: integer("current_salary").notNull(), // cents
  proposedSalary: integer("proposed_salary").notNull(), // cents
  adjustmentPercent: real("adjustment_percent"),
  reason: text("reason"),
  approved: boolean("approved"),
});

// ─── Tax Configuration ──────────────────────────────────────────────
export const taxBracket = pgTable("tax_bracket", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jurisdictionLevel: taxJurisdictionLevelEnum("jurisdiction_level").notNull().default("federal"),
  jurisdiction: text("jurisdiction"), // e.g. "CA", "NY"
  minIncome: integer("min_income").notNull(), // cents (annual)
  maxIncome: integer("max_income"), // cents (null = no limit)
  rate: integer("rate").notNull(), // basis points
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const employeeTaxConfig = pgTable("employee_tax_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .unique()
    .references(() => payrollEmployee.id, { onDelete: "cascade" }),
  filingStatus: filingStatusEnum("filing_status").notNull().default("single"),
  federalAllowances: integer("federal_allowances").notNull().default(0),
  stateAllowances: integer("state_allowances").notNull().default(0),
  additionalWithholding: integer("additional_withholding").default(0), // cents
  exempt: boolean("exempt").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Shift Definitions & Schedules ──────────────────────────────────
export const shiftDefinition = pgTable("shift_definition", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shiftType: shiftTypeEnum("shift_type").notNull().default("regular"),
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(), // "17:00"
  premiumPercent: real("premium_percent").default(0), // extra % on top of base
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const employeeSchedule = pgTable("employee_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id")
    .notNull()
    .references(() => shiftDefinition.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 6=Sat
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
});

// ─── Payslips ───────────────────────────────────────────────────────
export const payslip = pgTable("payslip", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollRunId: uuid("payroll_run_id")
    .notNull()
    .references(() => payrollRun.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => payrollEmployee.id),
  payrollItemId: uuid("payroll_item_id")
    .notNull()
    .references(() => payrollItem.id),
  status: payslipStatusEnum("status").notNull().default("generated"),
  grossAmount: integer("gross_amount").notNull(), // cents
  netAmount: integer("net_amount").notNull(), // cents
  taxAmount: integer("tax_amount").notNull(), // cents
  deductionsBreakdown: jsonb("deductions_breakdown"), // [{name, amount, category}]
  ytdGross: integer("ytd_gross").notNull().default(0), // cents
  ytdNet: integer("ytd_net").notNull().default(0), // cents
  ytdTax: integer("ytd_tax").notNull().default(0), // cents
  generatedAt: timestamp("generated_at", { mode: "date" }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { mode: "date" }),
  viewedAt: timestamp("viewed_at", { mode: "date" }),
});

// ─── Relations ──────────────────────────────────────────────────────
export const payrollSettingsRelations = relations(payrollSettings, ({ one }) => ({
  organization: one(organization, {
    fields: [payrollSettings.organizationId],
    references: [organization.id],
  }),
}));

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
    compensationBandRef: one(compensationBand, {
      fields: [payrollEmployee.compensationBandId],
      references: [compensationBand.id],
    }),
    payrollItems: many(payrollItem),
    deductions: many(employeeDeduction),
    leaveBalances: many(employeeLeaveBalance),
    taxConfig: one(employeeTaxConfig, {
      fields: [payrollEmployee.id],
      references: [employeeTaxConfig.employeeId],
    }),
    timesheets: many(timesheet),
    schedules: many(employeeSchedule),
    payslips: many(payslip),
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
    parentRun: one(payrollRun, {
      fields: [payrollRun.parentRunId],
      references: [payrollRun.id],
    }),
    approvedByMember: one(member, {
      fields: [payrollRun.approvedBy],
      references: [member.id],
    }),
    items: many(payrollItem),
    bonuses: many(payrollBonus),
    approvalRecords: many(approvalRecord),
    payslips: many(payslip),
  })
);

export const payrollItemRelations = relations(payrollItem, ({ one, many }) => ({
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
  timesheetRef: one(timesheet, {
    fields: [payrollItem.timesheetId],
    references: [timesheet.id],
  }),
  overtimeDetail: one(payrollItemOvertime, {
    fields: [payrollItem.id],
    references: [payrollItemOvertime.payrollItemId],
  }),
  deductionBreakdowns: many(payrollItemDeduction),
}));

export const deductionTypeRelations = relations(deductionType, ({ one, many }) => ({
  organization: one(organization, {
    fields: [deductionType.organizationId],
    references: [organization.id],
  }),
  employeeDeductions: many(employeeDeduction),
}));

export const employeeDeductionRelations = relations(employeeDeduction, ({ one }) => ({
  employee: one(payrollEmployee, {
    fields: [employeeDeduction.employeeId],
    references: [payrollEmployee.id],
  }),
  deductionType: one(deductionType, {
    fields: [employeeDeduction.deductionTypeId],
    references: [deductionType.id],
  }),
}));

export const payrollItemDeductionRelations = relations(payrollItemDeduction, ({ one }) => ({
  payrollItem: one(payrollItem, {
    fields: [payrollItemDeduction.payrollItemId],
    references: [payrollItem.id],
  }),
  deductionType: one(deductionType, {
    fields: [payrollItemDeduction.deductionTypeId],
    references: [deductionType.id],
  }),
}));

export const payrollBonusRelations = relations(payrollBonus, ({ one }) => ({
  payrollRun: one(payrollRun, {
    fields: [payrollBonus.payrollRunId],
    references: [payrollRun.id],
  }),
  employee: one(payrollEmployee, {
    fields: [payrollBonus.employeeId],
    references: [payrollEmployee.id],
  }),
}));

export const payrollItemOvertimeRelations = relations(payrollItemOvertime, ({ one }) => ({
  payrollItem: one(payrollItem, {
    fields: [payrollItemOvertime.payrollItemId],
    references: [payrollItem.id],
  }),
}));

export const approvalChainRelations = relations(approvalChain, ({ one, many }) => ({
  organization: one(organization, {
    fields: [approvalChain.organizationId],
    references: [organization.id],
  }),
  steps: many(approvalChainStep),
}));

export const approvalChainStepRelations = relations(approvalChainStep, ({ one }) => ({
  chain: one(approvalChain, {
    fields: [approvalChainStep.chainId],
    references: [approvalChain.id],
  }),
  approver: one(member, {
    fields: [approvalChainStep.approverId],
    references: [member.id],
  }),
}));

export const approvalRecordRelations = relations(approvalRecord, ({ one }) => ({
  payrollRun: one(payrollRun, {
    fields: [approvalRecord.payrollRunId],
    references: [payrollRun.id],
  }),
  step: one(approvalChainStep, {
    fields: [approvalRecord.stepId],
    references: [approvalChainStep.id],
  }),
  approver: one(member, {
    fields: [approvalRecord.approverId],
    references: [member.id],
  }),
}));

export const timesheetRelations = relations(timesheet, ({ one, many }) => ({
  organization: one(organization, {
    fields: [timesheet.organizationId],
    references: [organization.id],
  }),
  employee: one(payrollEmployee, {
    fields: [timesheet.employeeId],
    references: [payrollEmployee.id],
  }),
  approvedByMember: one(member, {
    fields: [timesheet.approvedBy],
    references: [member.id],
  }),
  entries: many(timesheetEntry),
}));

export const timesheetEntryRelations = relations(timesheetEntry, ({ one }) => ({
  timesheet: one(timesheet, {
    fields: [timesheetEntry.timesheetId],
    references: [timesheet.id],
  }),
  project: one(project, {
    fields: [timesheetEntry.projectId],
    references: [project.id],
  }),
}));

export const contractorRelations = relations(contractor, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contractor.organizationId],
    references: [organization.id],
  }),
  payments: many(contractorPayment),
}));

export const contractorPaymentRelations = relations(contractorPayment, ({ one }) => ({
  contractor: one(contractor, {
    fields: [contractorPayment.contractorId],
    references: [contractor.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [contractorPayment.journalEntryId],
    references: [journalEntry.id],
  }),
}));

export const leavePolicyRelations = relations(leavePolicy, ({ one, many }) => ({
  organization: one(organization, {
    fields: [leavePolicy.organizationId],
    references: [organization.id],
  }),
  balances: many(employeeLeaveBalance),
  requests: many(leaveRequest),
}));

export const employeeLeaveBalanceRelations = relations(employeeLeaveBalance, ({ one }) => ({
  employee: one(payrollEmployee, {
    fields: [employeeLeaveBalance.employeeId],
    references: [payrollEmployee.id],
  }),
  policy: one(leavePolicy, {
    fields: [employeeLeaveBalance.policyId],
    references: [leavePolicy.id],
  }),
}));

export const leaveRequestRelations = relations(leaveRequest, ({ one }) => ({
  organization: one(organization, {
    fields: [leaveRequest.organizationId],
    references: [organization.id],
  }),
  employee: one(payrollEmployee, {
    fields: [leaveRequest.employeeId],
    references: [payrollEmployee.id],
  }),
  policy: one(leavePolicy, {
    fields: [leaveRequest.policyId],
    references: [leavePolicy.id],
  }),
  approvedByMember: one(member, {
    fields: [leaveRequest.approvedBy],
    references: [member.id],
  }),
}));

export const compensationBandRelations = relations(compensationBand, ({ one }) => ({
  organization: one(organization, {
    fields: [compensationBand.organizationId],
    references: [organization.id],
  }),
}));

export const compensationReviewRelations = relations(compensationReview, ({ one, many }) => ({
  organization: one(organization, {
    fields: [compensationReview.organizationId],
    references: [organization.id],
  }),
  entries: many(compensationReviewEntry),
}));

export const compensationReviewEntryRelations = relations(compensationReviewEntry, ({ one }) => ({
  review: one(compensationReview, {
    fields: [compensationReviewEntry.reviewId],
    references: [compensationReview.id],
  }),
  employee: one(payrollEmployee, {
    fields: [compensationReviewEntry.employeeId],
    references: [payrollEmployee.id],
  }),
}));

export const taxBracketRelations = relations(taxBracket, ({ one }) => ({
  organization: one(organization, {
    fields: [taxBracket.organizationId],
    references: [organization.id],
  }),
}));

export const employeeTaxConfigRelations = relations(employeeTaxConfig, ({ one }) => ({
  employee: one(payrollEmployee, {
    fields: [employeeTaxConfig.employeeId],
    references: [payrollEmployee.id],
  }),
}));

export const shiftDefinitionRelations = relations(shiftDefinition, ({ one, many }) => ({
  organization: one(organization, {
    fields: [shiftDefinition.organizationId],
    references: [organization.id],
  }),
  schedules: many(employeeSchedule),
}));

export const employeeScheduleRelations = relations(employeeSchedule, ({ one }) => ({
  employee: one(payrollEmployee, {
    fields: [employeeSchedule.employeeId],
    references: [payrollEmployee.id],
  }),
  shift: one(shiftDefinition, {
    fields: [employeeSchedule.shiftId],
    references: [shiftDefinition.id],
  }),
}));

export const payslipRelations = relations(payslip, ({ one }) => ({
  payrollRun: one(payrollRun, {
    fields: [payslip.payrollRunId],
    references: [payrollRun.id],
  }),
  employee: one(payrollEmployee, {
    fields: [payslip.employeeId],
    references: [payrollEmployee.id],
  }),
  payrollItem: one(payrollItem, {
    fields: [payslip.payrollItemId],
    references: [payrollItem.id],
  }),
}));
