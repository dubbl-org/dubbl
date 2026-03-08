import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { chartAccount } from "./bookkeeping";
import { contact } from "./contacts";

// --- Inventory Category ---

export const inventoryCategory = pgTable(
  "inventory_category",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    description: text("description"),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("inventory_category_org_name_idx").on(
      table.organizationId,
      table.name
    ),
  ]
);

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
    imageUrl: text("image_url"),
    category: text("category"),
    categoryId: uuid("category_id").references(() => inventoryCategory.id),
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

// --- Warehouse ---

export const warehouse = pgTable(
  "warehouse",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address"),
    isDefault: boolean("is_default").default(false),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("warehouse_org_code_idx").on(
      table.organizationId,
      table.code
    ),
  ]
);

// --- Inventory Movement ---

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "adjustment",
  "transfer_in",
  "transfer_out",
  "stock_take",
  "purchase",
  "sale",
  "initial",
]);

export const inventoryMovement = pgTable("inventory_movement", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id")
    .notNull()
    .references(() => inventoryItem.id, { onDelete: "cascade" }),
  warehouseId: uuid("warehouse_id")
    .references(() => warehouse.id),
  type: inventoryMovementTypeEnum("type").notNull(),
  quantity: integer("quantity").notNull(), // can be negative
  previousQuantity: integer("previous_quantity").notNull(),
  newQuantity: integer("new_quantity").notNull(),
  reason: text("reason"),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// --- Inventory Item Supplier ---

export const inventoryItemSupplier = pgTable(
  "inventory_item_supplier",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    supplierCode: text("supplier_code"), // their SKU
    leadTimeDays: integer("lead_time_days").default(0),
    purchasePrice: integer("purchase_price").default(0), // cents
    isPreferred: boolean("is_preferred").default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inventory_item_supplier_idx").on(
      table.inventoryItemId,
      table.contactId
    ),
  ]
);

// --- Stock Take ---

export const stockTakeStatusEnum = pgEnum("stock_take_status", [
  "draft",
  "in_progress",
  "completed",
  "cancelled",
]);

export const stockTake = pgTable("stock_take", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  warehouseId: uuid("warehouse_id")
    .references(() => warehouse.id),
  name: text("name").notNull(),
  status: stockTakeStatusEnum("status").notNull().default("draft"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const stockTakeLine = pgTable("stock_take_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  stockTakeId: uuid("stock_take_id")
    .notNull()
    .references(() => stockTake.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id")
    .notNull()
    .references(() => inventoryItem.id, { onDelete: "cascade" }),
  expectedQuantity: integer("expected_quantity").notNull().default(0),
  countedQuantity: integer("counted_quantity"),
  discrepancy: integer("discrepancy"),
  adjusted: boolean("adjusted").default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// --- Inventory Variant ---

export const inventoryVariant = pgTable("inventory_variant", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id")
    .notNull()
    .references(() => inventoryItem.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Red / Large"
  sku: text("sku"),
  purchasePrice: integer("purchase_price").default(0),
  salePrice: integer("sale_price").default(0),
  quantityOnHand: integer("quantity_on_hand").default(0),
  options: jsonb("options").$type<Record<string, string>>(), // e.g. {"Color": "Red", "Size": "Large"}
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// --- Warehouse Stock (per-warehouse quantities) ---

export const warehouseStock = pgTable(
  "warehouse_stock",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouse.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("warehouse_stock_org_item_wh_idx").on(
      table.organizationId,
      table.inventoryItemId,
      table.warehouseId
    ),
  ]
);

// --- Inventory Transfers ---

export const inventoryTransferStatusEnum = pgEnum("inventory_transfer_status", [
  "draft",
  "in_transit",
  "completed",
  "cancelled",
]);

export const inventoryTransfer = pgTable("inventory_transfer", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  fromWarehouseId: uuid("from_warehouse_id")
    .notNull()
    .references(() => warehouse.id),
  toWarehouseId: uuid("to_warehouse_id")
    .notNull()
    .references(() => warehouse.id),
  status: inventoryTransferStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  transferredBy: text("transferred_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const inventoryTransferLine = pgTable("inventory_transfer_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  transferId: uuid("transfer_id")
    .notNull()
    .references(() => inventoryTransfer.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id")
    .notNull()
    .references(() => inventoryItem.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  receivedQuantity: integer("received_quantity"),
});

// --- Relations ---

export const inventoryCategoryRelations = relations(inventoryCategory, ({ one, many }) => ({
  organization: one(organization, {
    fields: [inventoryCategory.organizationId],
    references: [organization.id],
  }),
  parent: one(inventoryCategory, {
    fields: [inventoryCategory.parentId],
    references: [inventoryCategory.id],
    relationName: "categoryParent",
  }),
  children: many(inventoryCategory, { relationName: "categoryParent" }),
  items: many(inventoryItem),
}));

export const inventoryItemRelations = relations(inventoryItem, ({ one, many }) => ({
  organization: one(organization, {
    fields: [inventoryItem.organizationId],
    references: [organization.id],
  }),
  categoryRef: one(inventoryCategory, {
    fields: [inventoryItem.categoryId],
    references: [inventoryCategory.id],
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
  movements: many(inventoryMovement),
  suppliers: many(inventoryItemSupplier),
  variants: many(inventoryVariant),
  stockTakeLines: many(stockTakeLine),
  warehouseStocks: many(warehouseStock),
}));

export const warehouseRelations = relations(warehouse, ({ one, many }) => ({
  organization: one(organization, {
    fields: [warehouse.organizationId],
    references: [organization.id],
  }),
  movements: many(inventoryMovement),
  stockTakes: many(stockTake),
  warehouseStocks: many(warehouseStock),
}));

export const inventoryMovementRelations = relations(inventoryMovement, ({ one }) => ({
  organization: one(organization, {
    fields: [inventoryMovement.organizationId],
    references: [organization.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [inventoryMovement.inventoryItemId],
    references: [inventoryItem.id],
  }),
  warehouse: one(warehouse, {
    fields: [inventoryMovement.warehouseId],
    references: [warehouse.id],
  }),
}));

export const inventoryItemSupplierRelations = relations(inventoryItemSupplier, ({ one }) => ({
  organization: one(organization, {
    fields: [inventoryItemSupplier.organizationId],
    references: [organization.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [inventoryItemSupplier.inventoryItemId],
    references: [inventoryItem.id],
  }),
  contact: one(contact, {
    fields: [inventoryItemSupplier.contactId],
    references: [contact.id],
  }),
}));

export const stockTakeRelations = relations(stockTake, ({ one, many }) => ({
  organization: one(organization, {
    fields: [stockTake.organizationId],
    references: [organization.id],
  }),
  warehouse: one(warehouse, {
    fields: [stockTake.warehouseId],
    references: [warehouse.id],
  }),
  lines: many(stockTakeLine),
}));

export const stockTakeLineRelations = relations(stockTakeLine, ({ one }) => ({
  stockTake: one(stockTake, {
    fields: [stockTakeLine.stockTakeId],
    references: [stockTake.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [stockTakeLine.inventoryItemId],
    references: [inventoryItem.id],
  }),
}));

export const inventoryVariantRelations = relations(inventoryVariant, ({ one }) => ({
  organization: one(organization, {
    fields: [inventoryVariant.organizationId],
    references: [organization.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [inventoryVariant.inventoryItemId],
    references: [inventoryItem.id],
  }),
}));

export const warehouseStockRelations = relations(warehouseStock, ({ one }) => ({
  organization: one(organization, {
    fields: [warehouseStock.organizationId],
    references: [organization.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [warehouseStock.inventoryItemId],
    references: [inventoryItem.id],
  }),
  warehouse: one(warehouse, {
    fields: [warehouseStock.warehouseId],
    references: [warehouse.id],
  }),
}));

export const inventoryTransferRelations = relations(inventoryTransfer, ({ one, many }) => ({
  organization: one(organization, {
    fields: [inventoryTransfer.organizationId],
    references: [organization.id],
  }),
  fromWarehouse: one(warehouse, {
    fields: [inventoryTransfer.fromWarehouseId],
    references: [warehouse.id],
    relationName: "transferFrom",
  }),
  toWarehouse: one(warehouse, {
    fields: [inventoryTransfer.toWarehouseId],
    references: [warehouse.id],
    relationName: "transferTo",
  }),
  lines: many(inventoryTransferLine),
}));

export const inventoryTransferLineRelations = relations(inventoryTransferLine, ({ one }) => ({
  transfer: one(inventoryTransfer, {
    fields: [inventoryTransferLine.transferId],
    references: [inventoryTransfer.id],
  }),
  inventoryItem: one(inventoryItem, {
    fields: [inventoryTransferLine.inventoryItemId],
    references: [inventoryItem.id],
  }),
}));
