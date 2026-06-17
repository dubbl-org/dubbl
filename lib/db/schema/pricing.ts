import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { inventoryItem } from "./inventory";

// --- Price List ---
//
// A named, currency-scoped set of unit prices for inventory items (e.g. a
// "Wholesale (USD)" or "Retail (EUR)" price book). Cross-currency pricing:
// each list carries its own currencyCode so the same item can have explicit
// prices in multiple currencies instead of being FX-converted from a base
// price. Lists can be date-bound via effectiveFrom/effectiveTo. This wave only
// builds the data model + CRUD + MCP + a resolvePrice() helper; wiring into
// invoice line pricing is owned by another wave.
export const priceList = pgTable(
  "price_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // ISO currency code the prices in this list are denominated in.
    currencyCode: text("currency_code").notNull().default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    // Optional validity window (inclusive). Null = unbounded on that side.
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("price_list_org_name_idx").on(
      table.organizationId,
      table.name
    ),
  ]
);

// --- Price List Item ---
//
// A single item's unit price within a price list, in integer cents of the
// list's currencyCode. minQuantity supports quantity-break / tiered pricing:
// multiple rows for the same item with ascending minQuantity describe the
// price floor at each volume tier (the row with the highest minQuantity that
// is <= the order quantity wins). minQuantity defaults to 1.
export const priceListItem = pgTable(
  "price_list_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceList.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    // Unit price in integer cents of the parent price list's currency.
    unitPrice: integer("unit_price").notNull().default(0),
    // Minimum order quantity at which this price applies (quantity-break tier).
    minQuantity: integer("min_quantity").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // One price row per (list, item, tier).
    uniqueIndex("price_list_item_list_item_qty_idx").on(
      table.priceListId,
      table.inventoryItemId,
      table.minQuantity
    ),
  ]
);

// --- Relations ---

export const priceListRelations = relations(priceList, ({ one, many }) => ({
  organization: one(organization, {
    fields: [priceList.organizationId],
    references: [organization.id],
  }),
  items: many(priceListItem),
}));

export const priceListItemRelations = relations(priceListItem, ({ one }) => ({
  priceList: one(priceList, {
    fields: [priceListItem.priceListId],
    references: [priceList.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [priceListItem.inventoryItemId],
    references: [inventoryItem.id],
  }),
}));
