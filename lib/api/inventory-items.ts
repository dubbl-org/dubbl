import { db } from "@/lib/db";
import { inventoryItem, warehouse } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";
import type { ValuedItem } from "@/lib/api/inventory-valuation";
import {
  assertInventoryPeriodOpen,
  assertItemAccounts,
  assertItemCodeFree,
  changeCostMethod,
  fail,
  getDefaultWarehouseId,
  postOpeningStockEntry,
  receiveOpeningStock,
  todayIso,
} from "@/lib/api/inventory-ops";
import { resolveItemCategory } from "@/lib/api/inventory-categories";

/**
 * Create and update inventory items. Shared by the REST routes and the MCP
 * tools. Money is integer cents; quantities are whole units.
 */

export interface InventoryItemInput {
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  categoryId?: string | null;
  sku?: string | null;
  purchasePrice?: number;
  salePrice?: number;
  costAccountId?: string | null;
  revenueAccountId?: string | null;
  inventoryAccountId?: string | null;
  costMethod?: "average" | "fifo";
  trackingMethod?: "none" | "serial" | "lot" | "batch";
  unitOfMeasure?: string | null;
  quantityOnHand?: number;
  warehouseId?: string | null;
  reorderPoint?: number;
  isActive?: boolean;
}

export type InventoryItemUpdate = Partial<Omit<InventoryItemInput, "quantityOnHand" | "warehouseId">>;

/**
 * Create an item. Opening stock (quantityOnHand > 0) needs a purchase price:
 * it's received through the costing engine into the chosen (or default)
 * location and posted DR Inventory / CR Opening Balance Equity (3000).
 */
export async function createInventoryItem(ctx: AuthContext, input: InventoryItemInput) {
  const { warehouseId: requestedWarehouseId, category, categoryId, quantityOnHand, ...fields } = input;
  const openingQty = quantityOnHand ?? 0;
  const unitCost = input.purchasePrice ?? 0;
  if (openingQty < 0) fail("Opening quantity can't be negative");
  // Stock with no cost would sit at $0 and every later sale would post $0 cost
  // of sales, so ask for a price instead of silently dropping the quantity.
  if (openingQty > 0 && unitCost <= 0) {
    fail("Enter a purchase price to add opening stock, so the stock has a value in your books");
  }
  await assertItemCodeFree(ctx.organizationId, input.code);
  await assertItemAccounts(ctx.organizationId, input);
  const categoryFields = await resolveItemCategory(db, ctx.organizationId, { categoryId, category });
  const today = todayIso();

  let openingWarehouseId: string | null = null;
  if (openingQty > 0) {
    await assertInventoryPeriodOpen(ctx.organizationId, today, ctx);
    if (requestedWarehouseId) {
      const wh = await db.query.warehouse.findFirst({
        where: and(
          eq(warehouse.id, requestedWarehouseId),
          eq(warehouse.organizationId, ctx.organizationId),
          notDeleted(warehouse.deletedAt)
        ),
      });
      if (!wh) fail("Location not found", 404);
      openingWarehouseId = wh.id;
    } else {
      openingWarehouseId = await getDefaultWarehouseId(ctx.organizationId);
    }
  }

  return db.transaction(async (tx) => {
    // Insert at zero on-hand/value, then add any opening stock through the
    // valuation path so averageCost / totalValue / FIFO layers are set.
    const [item] = await tx
      .insert(inventoryItem)
      .values({
        organizationId: ctx.organizationId,
        ...fields,
        ...(categoryFields ?? {}),
        quantityOnHand: 0,
        averageCost: 0,
        totalValue: 0,
      })
      .returning();

    if (openingQty > 0) {
      const r = await receiveOpeningStock(tx, {
        item: item as ValuedItem,
        quantity: openingQty,
        unitCost,
        warehouseId: openingWarehouseId,
        createdBy: ctx.userId,
      });
      await postOpeningStockEntry(tx, ctx, {
        lines: [{ item, value: r.value, movementId: r.movementId }],
        description: `Opening stock: ${item.name}`,
        reference: item.sku ?? null,
        sourceId: item.id,
        date: today,
      });
    }

    return (await tx.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, item.id) })) ?? item;
  });
}

/**
 * Update an item's details. Quantity and value don't change here (use an
 * adjustment); a costing method change keeps the book value as it is.
 */
export async function updateInventoryItem(ctx: AuthContext, id: string, input: InventoryItemUpdate) {
  const existing = await db.query.inventoryItem.findFirst({
    where: and(
      eq(inventoryItem.id, id),
      eq(inventoryItem.organizationId, ctx.organizationId),
      notDeleted(inventoryItem.deletedAt)
    ),
  });
  if (!existing) fail("Inventory item not found", 404);

  const { category, categoryId, costMethod, ...fields } = input;
  if (fields.code && fields.code !== existing.code) {
    await assertItemCodeFree(ctx.organizationId, fields.code, id);
  }
  await assertItemAccounts(ctx.organizationId, input);
  const categoryFields = await resolveItemCategory(db, ctx.organizationId, { categoryId, category });

  const updated = await db.transaction(async (tx) => {
    if (costMethod && costMethod !== existing.costMethod) {
      await changeCostMethod(tx, existing, costMethod);
    }
    const [row] = await tx
      .update(inventoryItem)
      .set({ ...fields, ...(categoryFields ?? {}), updatedAt: new Date() })
      .where(eq(inventoryItem.id, id))
      .returning();
    return row;
  });

  return { existing, updated };
}
