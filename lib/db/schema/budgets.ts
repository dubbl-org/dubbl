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
  jan: integer("jan").notNull().default(0),
  feb: integer("feb").notNull().default(0),
  mar: integer("mar").notNull().default(0),
  apr: integer("apr").notNull().default(0),
  may: integer("may").notNull().default(0),
  jun: integer("jun").notNull().default(0),
  jul: integer("jul").notNull().default(0),
  aug: integer("aug").notNull().default(0),
  sep: integer("sep").notNull().default(0),
  oct: integer("oct").notNull().default(0),
  nov: integer("nov").notNull().default(0),
  dec: integer("dec").notNull().default(0),
  total: integer("total").notNull().default(0),
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

export const budgetLineRelations = relations(budgetLine, ({ one }) => ({
  budget: one(budget, {
    fields: [budgetLine.budgetId],
    references: [budget.id],
  }),
  account: one(chartAccount, {
    fields: [budgetLine.accountId],
    references: [chartAccount.id],
  }),
}));
