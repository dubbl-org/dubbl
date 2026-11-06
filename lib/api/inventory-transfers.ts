import { db } from "@/lib/db";
import {
  inventoryItem,
  inventoryMovement,
  inventoryTransfer,
  inventoryTransferLine,
  warehouse,
  warehouseStock,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { fail, type OpsContext, type Tx } from "@/lib/api/inventory-ops";
import { totalsByItem } from "@/lib/inventory/math";

/**
 * Stock transfers between locations, shared by the REST routes and MCP tools.
 *
 *   Draft       nothing has moved yet
 *   On the way  (in_transit) stock has left the source location
 *   Arrived     (completed) stock is at the destination
 *   Cancelled   nothing moved, or stock on the way went back to the source
 *
 * A transfer only moves units between locations: the company-wide quantity and
 * book value don't change, so no journal entry is posted.
 */

const WITH = { fromWarehouse: true, toWarehouse: true, lines: true } as const;

type TransferStatus = "draft" | "in_transit" | "completed" | "cancelled";

async function loadTransfer(tx: Tx, organizationId: string, id: string) {
  const transfer = await tx.query.inventoryTransfer.findFirst({
    where: and(eq(inventoryTransfer.id, id), eq(inventoryTransfer.organizationId, organizationId)),
    with: { lines: true },
  });
  if (!transfer) fail("Transfer not found", 404);
  return transfer;
}

/** Move the status on, but only from the status we read (guards double clicks). */
async function setStatus(tx: Tx, id: string, from: TransferStatus, to: TransferStatus, extra: Record<string, unknown> = {}) {
  const [row] = await tx
    .update(inventoryTransfer)
    .set({ status: to, ...extra })
    .where(and(eq(inventoryTransfer.id, id), eq(inventoryTransfer.status, from)))
    .returning({ id: inventoryTransfer.id });
  if (!row) fail("This transfer was changed by someone else. Refresh and try again.", 409);
}

async function addLocationStock(tx: Tx, organizationId: string, itemId: string, warehouseId: string, delta: number) {
  await tx
    .insert(warehouseStock)
    .values({ organizationId, inventoryItemId: itemId, warehouseId, quantity: delta })
    .onConflictDoUpdate({
      target: [warehouseStock.organizationId, warehouseStock.inventoryItemId, warehouseStock.warehouseId],
      set: { quantity: sql`${warehouseStock.quantity} + ${delta}`, updatedAt: new Date() },
    });
}

/** Write one movement per line at a location (signed units), stamped to the transfer. */
async function writeMovements(
  tx: Tx,
  ctx: OpsContext,
  transferId: string,
  lines: { inventoryItemId: string; quantity: number }[],
  warehouseId: string,
  sign: 1 | -1,
  reason: string
) {
  if (lines.length === 0) return;
  const items = await tx.query.inventoryItem.findMany({
    where: inArray(inventoryItem.id, [...new Set(lines.map((l) => l.inventoryItemId))]),
    columns: { id: true, quantityOnHand: true },
  });
  const onHand = new Map(items.map((i) => [i.id, i.quantityOnHand]));
  for (const line of lines) {
    await addLocationStock(tx, ctx.organizationId, line.inventoryItemId, warehouseId, sign * line.quantity);
  }
  await tx.insert(inventoryMovement).values(
    lines.map((line) => ({
      organizationId: ctx.organizationId,
      inventoryItemId: line.inventoryItemId,
      warehouseId,
      type: sign < 0 ? ("transfer_out" as const) : ("transfer_in" as const),
      quantity: sign * line.quantity,
      // Company-wide stock doesn't change on a transfer.
      previousQuantity: onHand.get(line.inventoryItemId) ?? 0,
      newQuantity: onHand.get(line.inventoryItemId) ?? 0,
      reason,
      referenceType: "transfer",
      referenceId: transferId,
      createdBy: ctx.userId,
    }))
  );
}

/** Check the source location holds enough of every item (locks the rows). */
async function assertSourceStock(
  tx: Tx,
  organizationId: string,
  warehouseId: string,
  lines: { inventoryItemId: string; quantity: number }[]
) {
  const needs = totalsByItem(lines);
  if (needs.size === 0) return;
  const rows = await tx
    .select({ itemId: warehouseStock.inventoryItemId, quantity: warehouseStock.quantity })
    .from(warehouseStock)
    .where(
      and(
        eq(warehouseStock.organizationId, organizationId),
        eq(warehouseStock.warehouseId, warehouseId),
        inArray(warehouseStock.inventoryItemId, [...needs.keys()])
      )
    )
    .for("update");
  const have = new Map(rows.map((r) => [r.itemId, r.quantity]));
  const short: string[] = [];
  for (const [itemId, need] of needs) {
    if ((have.get(itemId) ?? 0) < need) short.push(itemId);
  }
  if (short.length > 0) {
    const items = await tx.query.inventoryItem.findMany({
      where: inArray(inventoryItem.id, short),
      columns: { id: true, name: true },
    });
    const detail = items
      .map((i) => `${i.name}: need ${needs.get(i.id)}, have ${have.get(i.id) ?? 0}`)
      .join("; ");
    fail(`Not enough stock at the source location (${detail})`, 409);
  }
}

export async function getTransfer(organizationId: string, id: string) {
  return db.query.inventoryTransfer.findFirst({
    where: and(eq(inventoryTransfer.id, id), eq(inventoryTransfer.organizationId, organizationId)),
    with: WITH,
  });
}

export async function listTransfers(organizationId: string) {
  return db.query.inventoryTransfer.findMany({
    where: eq(inventoryTransfer.organizationId, organizationId),
    orderBy: (t, { desc }) => desc(t.createdAt),
    with: WITH,
  });
}

/** Create a draft transfer. Nothing moves until it's sent or completed. */
export async function createTransfer(
  ctx: OpsContext,
  input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    notes?: string | null;
    lines: { inventoryItemId: string; quantity: number }[];
  }
) {
  if (input.fromWarehouseId === input.toWarehouseId) fail("Pick two different locations");
  if (input.lines.length === 0) fail("Add at least one item");
  if (input.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) fail("Quantities must be whole numbers above 0");

  const places = await db.query.warehouse.findMany({
    where: and(
      eq(warehouse.organizationId, ctx.organizationId),
      inArray(warehouse.id, [input.fromWarehouseId, input.toWarehouseId]),
      notDeleted(warehouse.deletedAt)
    ),
  });
  const from = places.find((w) => w.id === input.fromWarehouseId);
  const to = places.find((w) => w.id === input.toWarehouseId);
  if (!from) fail("Source location not found", 404);
  if (!to) fail("Destination location not found", 404);
  if (to.isActive === false) fail(`${to.name} is inactive`);

  const itemIds = [...new Set(input.lines.map((l) => l.inventoryItemId))];
  const items = await db.query.inventoryItem.findMany({
    where: and(
      eq(inventoryItem.organizationId, ctx.organizationId),
      inArray(inventoryItem.id, itemIds),
      notDeleted(inventoryItem.deletedAt)
    ),
    columns: { id: true },
  });
  if (items.length !== itemIds.length) fail("Some items weren't found", 404);

  const id = await db.transaction(async (tx) => {
    const [transfer] = await tx
      .insert(inventoryTransfer)
      .values({
        organizationId: ctx.organizationId,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        notes: input.notes ?? null,
        transferredBy: ctx.userId,
      })
      .returning();
    await tx.insert(inventoryTransferLine).values(
      input.lines.map((l) => ({ transferId: transfer.id, inventoryItemId: l.inventoryItemId, quantity: l.quantity }))
    );
    return transfer.id;
  });
  return getTransfer(ctx.organizationId, id);
}

/** Mark a draft as on the way: the stock leaves the source location. */
export async function sendTransfer(ctx: OpsContext, id: string) {
  await db.transaction(async (tx) => {
    const t = await loadTransfer(tx, ctx.organizationId, id);
    if (t.status !== "draft") fail(t.status === "in_transit" ? "This transfer is already on the way" : "Only a draft transfer can be sent");
    await assertSourceStock(tx, ctx.organizationId, t.fromWarehouseId, t.lines);
    await writeMovements(tx, ctx, t.id, t.lines, t.fromWarehouseId, -1, "Transfer sent");
    await setStatus(tx, t.id, "draft", "in_transit");
  });
  return getTransfer(ctx.organizationId, id);
}

/** Mark as arrived: stock lands at the destination (sending it first if needed). */
export async function completeTransfer(ctx: OpsContext, id: string) {
  await db.transaction(async (tx) => {
    const t = await loadTransfer(tx, ctx.organizationId, id);
    if (t.status === "completed") fail("Transfer already completed");
    if (t.status === "cancelled") fail("Transfer is cancelled");
    if (t.status === "draft") {
      await assertSourceStock(tx, ctx.organizationId, t.fromWarehouseId, t.lines);
      await writeMovements(tx, ctx, t.id, t.lines, t.fromWarehouseId, -1, "Transfer sent");
    }
    await writeMovements(tx, ctx, t.id, t.lines, t.toWarehouseId, 1, "Transfer arrived");
    for (const line of t.lines) {
      await tx
        .update(inventoryTransferLine)
        .set({ receivedQuantity: line.quantity })
        .where(eq(inventoryTransferLine.id, line.id));
    }
    await setStatus(tx, t.id, t.status, "completed", { completedAt: new Date() });
  });
  return getTransfer(ctx.organizationId, id);
}

/** Cancel: stock already on the way goes back to the source location. */
export async function cancelTransfer(ctx: OpsContext, id: string) {
  await db.transaction(async (tx) => {
    const t = await loadTransfer(tx, ctx.organizationId, id);
    if (t.status === "completed") fail("An arrived transfer can't be cancelled. Create a transfer back instead.");
    if (t.status === "cancelled") fail("Transfer is already cancelled");
    if (t.status === "in_transit") {
      await writeMovements(tx, ctx, t.id, t.lines, t.fromWarehouseId, 1, "Transfer cancelled, stock returned");
    }
    await setStatus(tx, t.id, t.status, "cancelled");
  });
  return getTransfer(ctx.organizationId, id);
}

export async function updateTransferNotes(ctx: OpsContext, id: string, notes: string | null) {
  const [row] = await db
    .update(inventoryTransfer)
    .set({ notes })
    .where(and(eq(inventoryTransfer.id, id), eq(inventoryTransfer.organizationId, ctx.organizationId)))
    .returning({ id: inventoryTransfer.id });
  if (!row) fail("Transfer not found", 404);
  return getTransfer(ctx.organizationId, id);
}
