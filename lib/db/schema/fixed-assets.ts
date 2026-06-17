import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { chartAccount, journalEntry } from "./bookkeeping";

// Enums
export const depreciationMethodEnum = pgEnum("depreciation_method", [
  "straight_line",
  "declining_balance",
  "units_of_production",
  "sum_of_years_digits",
]);

// First-period (and disposal-period) timing conventions. Controls how much
// depreciation is taken in the period an asset enters/leaves service.
export const depreciationConventionEnum = pgEnum("depreciation_convention", [
  "full_month",
  "mid_month",
  "half_year",
  "mid_quarter",
  "pro_rata_days",
  "full_at_purchase",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "active",
  "fully_depreciated",
  "disposed",
  // Capital-work-in-progress assets being constructed/assembled; do not
  // depreciate until capitalized into service.
  "in_progress",
]);

// Asset Category — a reusable template of depreciation + posting defaults that
// can be copied onto each asset at creation time (reusable asset classes).
export const assetCategory = pgTable("asset_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  defaultDepreciationMethod: depreciationMethodEnum("default_depreciation_method")
    .notNull()
    .default("straight_line"),
  defaultConvention: depreciationConventionEnum("default_convention")
    .notNull()
    .default("full_month"),
  defaultUsefulLifeMonths: integer("default_useful_life_months"),
  defaultResidualValue: integer("default_residual_value").notNull().default(0), // cents
  // Default declining-balance rate, in basis points (2000 = 20%).
  defaultDepreciationRateBp: integer("default_depreciation_rate_bp"),
  assetAccountId: uuid("asset_account_id").references(() => chartAccount.id),
  depreciationAccountId: uuid("depreciation_account_id").references(
    () => chartAccount.id
  ),
  accumulatedDepAccountId: uuid("accumulated_dep_account_id").references(
    () => chartAccount.id
  ),
  cwipAccountId: uuid("cwip_account_id").references(() => chartAccount.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Fixed Asset
export const fixedAsset = pgTable("fixed_asset", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  assetNumber: text("asset_number").notNull(),
  categoryId: uuid("category_id").references(() => assetCategory.id),
  purchaseDate: date("purchase_date").notNull(),
  // Date the asset was placed in service / began depreciating. Defaults to the
  // purchase date when not supplied; used as the convention anchor date.
  inServiceDate: date("in_service_date"),
  purchasePrice: integer("purchase_price").notNull(), // cents
  residualValue: integer("residual_value").notNull().default(0), // cents
  usefulLifeMonths: integer("useful_life_months").notNull(),
  depreciationMethod: depreciationMethodEnum("depreciation_method")
    .notNull()
    .default("straight_line"),
  convention: depreciationConventionEnum("convention")
    .notNull()
    .default("full_month"),
  // Units-of-production inputs.
  totalExpectedUnits: integer("total_expected_units"),
  unitOfMeasure: text("unit_of_measure"),
  accumulatedDepreciation: integer("accumulated_depreciation")
    .notNull()
    .default(0), // cents
  netBookValue: integer("net_book_value").notNull(), // cents
  assetAccountId: uuid("asset_account_id").references(() => chartAccount.id),
  depreciationAccountId: uuid("depreciation_account_id").references(
    () => chartAccount.id
  ),
  accumulatedDepAccountId: uuid("accumulated_dep_account_id").references(
    () => chartAccount.id
  ),
  // Capital-work-in-progress: when true the asset is being constructed and
  // accumulates cost in the CWIP account until capitalized.
  isCwip: boolean("is_cwip").notNull().default(false),
  capitalizedDate: date("capitalized_date"),
  cwipAccountId: uuid("cwip_account_id").references(() => chartAccount.id),
  // IAS 16 revaluation model.
  revaluedAmount: integer("revalued_amount"), // cents — latest revalued carrying amount
  revaluationSurplusBalance: integer("revaluation_surplus_balance")
    .notNull()
    .default(0), // cents — running balance of surplus held in equity for this asset
  revaluationReserveAccountId: uuid("revaluation_reserve_account_id").references(
    () => chartAccount.id
  ),
  impairmentExpenseAccountId: uuid("impairment_expense_account_id").references(
    () => chartAccount.id
  ),
  status: assetStatusEnum("status").notNull().default("active"),
  disposalDate: date("disposal_date"),
  disposalAmount: integer("disposal_amount"), // cents
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Depreciation Entry
export const depreciationEntry = pgTable("depreciation_entry", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  fixedAssetId: uuid("fixed_asset_id")
    .notNull()
    .references(() => fixedAsset.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: integer("amount").notNull(), // cents
  // Units consumed this period (units-of-production only; nullable otherwise).
  unitsThisPeriod: integer("units_this_period"),
  // The period this charge covers (informational; nullable for legacy rows).
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Asset Revaluation — audit trail of IAS 16 revaluations/impairments.
export const assetRevaluation = pgTable("asset_revaluation", {
  id: uuid("id").primaryKey().defaultRandom(),
  fixedAssetId: uuid("fixed_asset_id")
    .notNull()
    .references(() => fixedAsset.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  // Carrying amount before and the new revalued amount, in cents.
  previousCarryingAmount: integer("previous_carrying_amount").notNull(),
  revaluedAmount: integer("revalued_amount").notNull(),
  // Signed change (revalued − previous): positive = upward, negative = downward.
  changeAmount: integer("change_amount").notNull(),
  // How the change was split between equity surplus and P&L (impairment).
  surplusAmount: integer("surplus_amount").notNull().default(0), // cents to/from revaluation surplus (equity)
  impairmentAmount: integer("impairment_amount").notNull().default(0), // cents recognized in P&L
  isImpairment: boolean("is_impairment").notNull().default(false),
  notes: text("notes"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// CWIP Cost — individual costs accumulated against a capital-work-in-progress
// asset before it is capitalized into service.
export const cwipCost = pgTable("cwip_cost", {
  id: uuid("id").primaryKey().defaultRandom(),
  fixedAssetId: uuid("fixed_asset_id")
    .notNull()
    .references(() => fixedAsset.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  description: text("description"),
  amount: integer("amount").notNull(), // cents
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const assetCategoryRelations = relations(assetCategory, ({ one, many }) => ({
  organization: one(organization, {
    fields: [assetCategory.organizationId],
    references: [organization.id],
  }),
  assetAccount: one(chartAccount, {
    fields: [assetCategory.assetAccountId],
    references: [chartAccount.id],
    relationName: "categoryAssetAccount",
  }),
  depreciationAccount: one(chartAccount, {
    fields: [assetCategory.depreciationAccountId],
    references: [chartAccount.id],
    relationName: "categoryDepreciationAccount",
  }),
  accumulatedDepAccount: one(chartAccount, {
    fields: [assetCategory.accumulatedDepAccountId],
    references: [chartAccount.id],
    relationName: "categoryAccumulatedDepAccount",
  }),
  cwipAccount: one(chartAccount, {
    fields: [assetCategory.cwipAccountId],
    references: [chartAccount.id],
    relationName: "categoryCwipAccount",
  }),
  assets: many(fixedAsset),
}));

export const fixedAssetRelations = relations(fixedAsset, ({ one, many }) => ({
  organization: one(organization, {
    fields: [fixedAsset.organizationId],
    references: [organization.id],
  }),
  category: one(assetCategory, {
    fields: [fixedAsset.categoryId],
    references: [assetCategory.id],
  }),
  assetAccount: one(chartAccount, {
    fields: [fixedAsset.assetAccountId],
    references: [chartAccount.id],
    relationName: "assetAccount",
  }),
  depreciationAccount: one(chartAccount, {
    fields: [fixedAsset.depreciationAccountId],
    references: [chartAccount.id],
    relationName: "depreciationAccount",
  }),
  accumulatedDepAccount: one(chartAccount, {
    fields: [fixedAsset.accumulatedDepAccountId],
    references: [chartAccount.id],
    relationName: "accumulatedDepAccount",
  }),
  cwipAccount: one(chartAccount, {
    fields: [fixedAsset.cwipAccountId],
    references: [chartAccount.id],
    relationName: "assetCwipAccount",
  }),
  revaluationReserveAccount: one(chartAccount, {
    fields: [fixedAsset.revaluationReserveAccountId],
    references: [chartAccount.id],
    relationName: "revaluationReserveAccount",
  }),
  impairmentExpenseAccount: one(chartAccount, {
    fields: [fixedAsset.impairmentExpenseAccountId],
    references: [chartAccount.id],
    relationName: "impairmentExpenseAccount",
  }),
  depreciationEntries: many(depreciationEntry),
  revaluations: many(assetRevaluation),
  cwipCosts: many(cwipCost),
}));

export const depreciationEntryRelations = relations(
  depreciationEntry,
  ({ one }) => ({
    fixedAsset: one(fixedAsset, {
      fields: [depreciationEntry.fixedAssetId],
      references: [fixedAsset.id],
    }),
    journalEntry: one(journalEntry, {
      fields: [depreciationEntry.journalEntryId],
      references: [journalEntry.id],
    }),
  })
);

export const assetRevaluationRelations = relations(
  assetRevaluation,
  ({ one }) => ({
    fixedAsset: one(fixedAsset, {
      fields: [assetRevaluation.fixedAssetId],
      references: [fixedAsset.id],
    }),
    journalEntry: one(journalEntry, {
      fields: [assetRevaluation.journalEntryId],
      references: [journalEntry.id],
    }),
  })
);

export const cwipCostRelations = relations(cwipCost, ({ one }) => ({
  fixedAsset: one(fixedAsset, {
    fields: [cwipCost.fixedAssetId],
    references: [fixedAsset.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [cwipCost.journalEntryId],
    references: [journalEntry.id],
  }),
}));
