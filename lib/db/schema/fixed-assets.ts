import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";
import { organization } from "./auth";
import { chartAccount, journalEntry } from "./bookkeeping";

// Enums
export const depreciationMethodEnum = pgEnum("depreciation_method", [
  "straight_line",
  "declining_balance",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "active",
  "fully_depreciated",
  "disposed",
]);

// Fixed Asset
export const fixedAsset = pgTable("fixed_asset", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  assetNumber: text("asset_number").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  purchasePrice: integer("purchase_price").notNull(), // cents
  residualValue: integer("residual_value").notNull().default(0), // cents
  usefulLifeMonths: integer("useful_life_months").notNull(),
  depreciationMethod: depreciationMethodEnum("depreciation_method")
    .notNull()
    .default("straight_line"),
  accumulatedDepreciation: integer("accumulated_depreciation")
    .notNull()
    .default(0), // cents
  netBookValue: integer("net_book_value").notNull(), // cents
  assetAccountId: text("asset_account_id").references(() => chartAccount.id),
  depreciationAccountId: text("depreciation_account_id").references(
    () => chartAccount.id
  ),
  accumulatedDepAccountId: text("accumulated_dep_account_id").references(
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
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  fixedAssetId: text("fixed_asset_id")
    .notNull()
    .references(() => fixedAsset.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: integer("amount").notNull(), // cents
  journalEntryId: text("journal_entry_id").references(() => journalEntry.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const fixedAssetRelations = relations(fixedAsset, ({ one, many }) => ({
  organization: one(organization, {
    fields: [fixedAsset.organizationId],
    references: [organization.id],
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
  depreciationEntries: many(depreciationEntry),
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
