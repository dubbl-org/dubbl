import { db } from "@/lib/db";
import { inventoryTransfer, warehouse, warehouseStock } from "@/lib/db/schema";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { fail, type Tx } from "@/lib/api/inventory-ops";

/**
 * Locations (warehouses), shared by the REST routes and the MCP tools.
 * Only one location can be the default; an inactive location can't be it.
 */

export interface WarehouseInput {
  name: string;
  code: string;
  address?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

async function assertCodeFree(tx: Tx, organizationId: string, code: string, exceptId?: string) {
  const clash = await tx.query.warehouse.findFirst({
    where: and(eq(warehouse.organizationId, organizationId), eq(warehouse.code, code)),
    columns: { id: true },
  });
  if (clash && clash.id !== exceptId) fail(`Another location already uses the code "${code}"`, 409);
}

async function clearOtherDefaults(tx: Tx, organizationId: string, keepId: string) {
  await tx
    .update(warehouse)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(warehouse.organizationId, organizationId), ne(warehouse.id, keepId), eq(warehouse.isDefault, true)));
}

export async function createWarehouse(organizationId: string, input: WarehouseInput) {
  return db.transaction(async (tx) => {
    await assertCodeFree(tx, organizationId, input.code);
    const isActive = input.isActive ?? true;
    const [created] = await tx
      .insert(warehouse)
      .values({ organizationId, ...input, isActive, isDefault: !!input.isDefault && isActive })
      .returning();
    if (created.isDefault) await clearOtherDefaults(tx, organizationId, created.id);
    return created;
  });
}

export async function updateWarehouse(organizationId: string, id: string, input: Partial<WarehouseInput>) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.warehouse.findFirst({
      where: and(eq(warehouse.id, id), eq(warehouse.organizationId, organizationId), notDeleted(warehouse.deletedAt)),
    });
    if (!existing) fail("Warehouse not found", 404);
    if (input.code && input.code !== existing.code) await assertCodeFree(tx, organizationId, input.code, id);

    const isActive = input.isActive ?? existing.isActive ?? true;
    if (input.isDefault && !isActive) fail("An inactive location can't be the default");
    const updates: Partial<WarehouseInput> & { updatedAt: Date } = { ...input, updatedAt: new Date() };
    // Deactivating the default location also stops it being the default.
    if (!isActive) updates.isDefault = false;

    const [updated] = await tx.update(warehouse).set(updates).where(eq(warehouse.id, id)).returning();
    if (updated.isDefault) await clearOtherDefaults(tx, organizationId, id);
    return { existing, updated };
  });
}

/** Soft-delete a location that holds no stock and has no open transfers. */
export async function deleteWarehouse(organizationId: string, id: string) {
  const existing = await db.query.warehouse.findFirst({
    where: and(eq(warehouse.id, id), eq(warehouse.organizationId, organizationId), notDeleted(warehouse.deletedAt)),
  });
  if (!existing) fail("Warehouse not found", 404);

  const [stock] = await db
    .select({ units: sql<number>`coalesce(sum(abs(${warehouseStock.quantity})), 0)`.mapWith(Number) })
    .from(warehouseStock)
    .where(and(eq(warehouseStock.organizationId, organizationId), eq(warehouseStock.warehouseId, id)));
  if ((stock?.units ?? 0) > 0) {
    fail("This location still holds stock. Move it out with a transfer, or count it out with a stocktake, first.", 409);
  }
  const openTransfer = await db.query.inventoryTransfer.findFirst({
    where: and(
      eq(inventoryTransfer.organizationId, organizationId),
      inArray(inventoryTransfer.status, ["draft", "in_transit"]),
      or(eq(inventoryTransfer.fromWarehouseId, id), eq(inventoryTransfer.toWarehouseId, id))
    ),
    columns: { id: true },
  });
  if (openTransfer) fail("Finish or cancel the open transfers for this location first.", 409);

  await db
    .update(warehouse)
    .set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() })
    .where(eq(warehouse.id, id));
  return existing;
}
