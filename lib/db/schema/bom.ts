import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  numeric,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { inventoryItem } from "./inventory";

export const assemblyOrderStatusEnum = pgEnum("assembly_order_status", [
  "draft",
  "in_progress",
  "completed",
  "cancelled",
]);

export const billOfMaterials = pgTable("bill_of_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  assemblyItemId: uuid("assembly_item_id")
    .notNull()
    .references(() => inventoryItem.id),
  name: text("name").notNull(),
  description: text("description"),
  laborCostCents: integer("labor_cost_cents").notNull().default(0),
  overheadCostCents: integer("overhead_cost_cents").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const bomComponent = pgTable("bom_component", {
  id: uuid("id").primaryKey().defaultRandom(),
  bomId: uuid("bom_id")
    .notNull()
    .references(() => billOfMaterials.id, { onDelete: "cascade" }),
  componentItemId: uuid("component_item_id")
    .notNull()
    .references(() => inventoryItem.id),
  quantity: numeric("quantity").notNull(),
  wastagePercent: numeric("wastage_percent").default("0"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const assemblyOrder = pgTable("assembly_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  bomId: uuid("bom_id")
    .notNull()
    .references(() => billOfMaterials.id),
  quantity: integer("quantity").notNull().default(1),
  status: assemblyOrderStatusEnum("status").notNull().default("draft"),
  completedAt: timestamp("completed_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// --- Relations ---

export const billOfMaterialsRelations = relations(billOfMaterials, ({ one, many }) => ({
  organization: one(organization, {
    fields: [billOfMaterials.organizationId],
    references: [organization.id],
  }),
  assemblyItem: one(inventoryItem, {
    fields: [billOfMaterials.assemblyItemId],
    references: [inventoryItem.id],
  }),
  components: many(bomComponent),
  assemblyOrders: many(assemblyOrder),
}));

export const bomComponentRelations = relations(bomComponent, ({ one }) => ({
  bom: one(billOfMaterials, {
    fields: [bomComponent.bomId],
    references: [billOfMaterials.id],
  }),
  componentItem: one(inventoryItem, {
    fields: [bomComponent.componentItemId],
    references: [inventoryItem.id],
  }),
}));

export const assemblyOrderRelations = relations(assemblyOrder, ({ one }) => ({
  organization: one(organization, {
    fields: [assemblyOrder.organizationId],
    references: [organization.id],
  }),
  bom: one(billOfMaterials, {
    fields: [assemblyOrder.bomId],
    references: [billOfMaterials.id],
  }),
}));
