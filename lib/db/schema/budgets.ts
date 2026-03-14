import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { fiscalYear, chartAccount } from "./bookkeeping";

// Budget
export const budget = pgTable("budget", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fiscalYearId: uuid("fiscal_year_id").references(() => fiscalYear.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  periodType: text("period_type").notNull().default("monthly"),
  varianceThresholdPct: integer("variance_threshold_pct").default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Budget Line
export const budgetLine = pgTable("budget_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budget.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => chartAccount.id),
  total: integer("total").notNull().default(0),
});

// Budget Period
export const budgetPeriod = pgTable("budget_period", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  budgetLineId: uuid("budget_line_id")
    .notNull()
    .references(() => budgetLine.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const budgetRelations = relations(budget, ({ one, many }) => ({
  organization: one(organization, {
    fields: [budget.organizationId],
    references: [organization.id],
  }),
  fiscalYear: one(fiscalYear, {
    fields: [budget.fiscalYearId],
    references: [fiscalYear.id],
  }),
  lines: many(budgetLine),
}));

export const budgetLineRelations = relations(budgetLine, ({ one, many }) => ({
  budget: one(budget, {
    fields: [budgetLine.budgetId],
    references: [budget.id],
  }),
  account: one(chartAccount, {
    fields: [budgetLine.accountId],
    references: [chartAccount.id],
  }),
  periods: many(budgetPeriod),
}));

export const budgetPeriodRelations = relations(budgetPeriod, ({ one }) => ({
  budgetLine: one(budgetLine, {
    fields: [budgetPeriod.budgetLineId],
    references: [budgetLine.id],
  }),
}));
