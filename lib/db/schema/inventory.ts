import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { chartAccount } from "./bookkeeping";

export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    sku: text("sku"),
    purchasePrice: integer("purchase_price").notNull().default(0), // cents
    salePrice: integer("sale_price").notNull().default(0), // cents
    costAccountId: uuid("cost_account_id").references(() => chartAccount.id),
    revenueAccountId: uuid("revenue_account_id").references(() => chartAccount.id),
    inventoryAccountId: uuid("inventory_account_id").references(() => chartAccount.id),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    reorderPoint: integer("reorder_point").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("inventory_item_org_code_idx").on(
      table.organizationId,
      table.code
    ),
  ]
);

// Relations
export const inventoryItemRelations = relations(inventoryItem, ({ one }) => ({
  organization: one(organization, {
    fields: [inventoryItem.organizationId],
    references: [organization.id],
  }),
  costAccount: one(chartAccount, {
    fields: [inventoryItem.costAccountId],
    references: [chartAccount.id],
    relationName: "inventoryCostAccount",
  }),
  revenueAccount: one(chartAccount, {
    fields: [inventoryItem.revenueAccountId],
    references: [chartAccount.id],
    relationName: "inventoryRevenueAccount",
  }),
  inventoryAccount: one(chartAccount, {
    fields: [inventoryItem.inventoryAccountId],
    references: [chartAccount.id],
    relationName: "inventoryInventoryAccount",
  }),
}));
