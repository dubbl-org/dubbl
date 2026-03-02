import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";
import { organization } from "./auth";
import { journalEntry } from "./bookkeeping";

// Enums
export const payFrequencyEnum = pgEnum("pay_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

export const payrollRunStatusEnum = pgEnum("payroll_run_status", [
  "draft",
  "processing",
  "completed",
  "void",
]);

// Payroll Employee
export const payrollEmployee = pgTable("payroll_employee", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  employeeNumber: text("employee_number").notNull(),
  position: text("position"),
  salary: integer("salary").notNull(), // cents - annual
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
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  payPeriodStart: date("pay_period_start").notNull(),
  payPeriodEnd: date("pay_period_end").notNull(),
  status: payrollRunStatusEnum("status").notNull().default("draft"),
  totalGross: integer("total_gross").notNull().default(0), // cents
  totalDeductions: integer("total_deductions").notNull().default(0), // cents
  totalNet: integer("total_net").notNull().default(0), // cents
  journalEntryId: text("journal_entry_id").references(() => journalEntry.id),
  processedAt: timestamp("processed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Payroll Item
export const payrollItem = pgTable("payroll_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  payrollRunId: text("payroll_run_id")
    .notNull()
    .references(() => payrollRun.id, { onDelete: "cascade" }),
  employeeId: text("employee_id")
    .notNull()
    .references(() => payrollEmployee.id),
  grossAmount: integer("gross_amount").notNull(), // cents
  taxAmount: integer("tax_amount").notNull(), // cents
  deductions: integer("deductions").notNull().default(0), // cents
  netAmount: integer("net_amount").notNull(), // cents
});

// Relations
export const payrollEmployeeRelations = relations(
  payrollEmployee,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [payrollEmployee.organizationId],
      references: [organization.id],
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
}));
