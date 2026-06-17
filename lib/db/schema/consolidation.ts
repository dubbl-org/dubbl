import {
  pgTable, text, uuid, timestamp, integer, date, pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

export const consolidationGroup = pgTable("consolidation_group", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentOrgId: uuid("parent_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Currency the consolidated worksheet is reported in (IAS 21 presentation currency).
  presentationCurrency: text("presentation_currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const consolidationGroupMember = pgTable("consolidation_group_member", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => consolidationGroup.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  label: text("label"),
  // The currency in which this member entity primarily operates (IAS 21 functional
  // currency). Null falls back to the member organization's defaultCurrency.
  functionalCurrency: text("functional_currency"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Type of rate applied when translating a balance into the presentation currency.
//   closing     — period-end spot rate (assets & liabilities)
//   average     — period average rate (revenue & expenses)
//   historical  — transaction-date / acquisition rate (equity)
export const consolidationRateTypeEnum = pgEnum("consolidation_rate_type", [
  "closing",
  "average",
  "historical",
]);

// Where a consolidation rate came from.
//   manual  — entered by the user for this group/period
//   derived — pulled from the org-level exchangeRate table at report time
export const consolidationRateSourceEnum = pgEnum("consolidation_rate_source", [
  "manual",
  "derived",
]);

// A translation rate for a (group, currency, rateType, periodEnd). Rate is stored
// as an integer with 6 decimal places (1_000_000 = 1.0), matching exchangeRate.
export const consolidationRate = pgTable("consolidation_rate", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => consolidationGroup.id, { onDelete: "cascade" }),
  // Source (functional) currency translated INTO the group presentation currency.
  currencyCode: text("currency_code").notNull(),
  rateType: consolidationRateTypeEnum("rate_type").notNull(),
  // Integer, 6dp. 1_000_000 = 1.0 unit of presentation per 1 unit of currencyCode.
  rate: integer("rate").notNull(),
  periodEndDate: date("period_end_date").notNull(),
  source: consolidationRateSourceEnum("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Kind of intercompany elimination a rule performs.
//   ar_ap            — eliminate intercompany receivables against payables
//   sales_cogs       — eliminate intercompany revenue against the matching expense/COGS
//   investment_equity — (schema-only stub for v1; not computed)
//   custom           — user-defined debit/credit account match
export const consolidationEliminationKindEnum = pgEnum("consolidation_elimination_kind", [
  "ar_ap",
  "sales_cogs",
  "investment_equity",
  "custom",
]);

// A reusable rule describing which account balances to eliminate on consolidation.
// debitAccountMatch / creditAccountMatch are account-code prefixes (e.g. "1200").
export const consolidationEliminationRule = pgTable("consolidation_elimination_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => consolidationGroup.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: consolidationEliminationKindEnum("kind").notNull(),
  debitAccountMatch: text("debit_account_match"),
  creditAccountMatch: text("credit_account_match"),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// A persisted elimination entry produced by running a rule for a period.
// amount is the eliminated amount in presentation-currency cents; varianceAmount is
// the unmatched residual routed to the Elimination CTA (CTA-E) line.
export const consolidationEliminationEntry = pgTable("consolidation_elimination_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => consolidationGroup.id, { onDelete: "cascade" }),
  periodEndDate: date("period_end_date").notNull(),
  ruleId: uuid("rule_id").notNull().references(() => consolidationEliminationRule.id, { onDelete: "cascade" }),
  // Presentation currency the eliminated amounts are expressed in.
  currencyCode: text("currency_code").notNull(),
  amount: integer("amount").notNull().default(0),
  varianceAmount: integer("variance_amount").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const consolidationGroupRelations = relations(consolidationGroup, ({ one, many }) => ({
  parentOrg: one(organization, {
    fields: [consolidationGroup.parentOrgId],
    references: [organization.id],
  }),
  members: many(consolidationGroupMember),
  rates: many(consolidationRate),
  eliminationRules: many(consolidationEliminationRule),
  eliminationEntries: many(consolidationEliminationEntry),
}));

export const consolidationGroupMemberRelations = relations(consolidationGroupMember, ({ one }) => ({
  group: one(consolidationGroup, {
    fields: [consolidationGroupMember.groupId],
    references: [consolidationGroup.id],
  }),
  organization: one(organization, {
    fields: [consolidationGroupMember.orgId],
    references: [organization.id],
  }),
}));

export const consolidationRateRelations = relations(consolidationRate, ({ one }) => ({
  group: one(consolidationGroup, {
    fields: [consolidationRate.groupId],
    references: [consolidationGroup.id],
  }),
}));

export const consolidationEliminationRuleRelations = relations(consolidationEliminationRule, ({ one, many }) => ({
  group: one(consolidationGroup, {
    fields: [consolidationEliminationRule.groupId],
    references: [consolidationGroup.id],
  }),
  entries: many(consolidationEliminationEntry),
}));

export const consolidationEliminationEntryRelations = relations(consolidationEliminationEntry, ({ one }) => ({
  group: one(consolidationGroup, {
    fields: [consolidationEliminationEntry.groupId],
    references: [consolidationGroup.id],
  }),
  rule: one(consolidationEliminationRule, {
    fields: [consolidationEliminationEntry.ruleId],
    references: [consolidationEliminationRule.id],
  }),
}));
