import { db } from "@/lib/db";
import {
  inventoryItem,
  inventoryMovement,
  inventoryCostLayer,
  inventoryLayerConsumption,
  warehouseStock,
} from "@/lib/db/schema";
import { and, eq, asc, sql } from "drizzle-orm";

/**
 * Perpetual inventory valuation engine (average cost + FIFO cost layers).
 *
 * SCOPE: this module owns the cost-flow MATH and the physical movement/quantity
 * bookkeeping (inventoryMovement rows, quantityOnHand, averageCost, totalValue,
 * warehouseStock, FIFO layers). It deliberately does NOT post the GL journal —
 * the offsetting account differs by context (AP/GRNI on receipt, COGS on sale,
 * shrinkage on adjustment) and is posted by the caller in journal-automation.ts.
 * This keeps the inventory debit/credit from being double-counted.
 *
 * Quantities are whole units (matching inventoryItem.quantityOnHand); costs are
 * integer cents per unit. value = unitCost * quantity (always in base currency).
 */

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export interface ValuedItem {
  id: string;
  organizationId: string;
  costMethod: string;
  averageCost: number;
  quantityOnHand: number;
  totalValue: number;
}

/** New moving-average unit cost after receiving `qty` units at `unitCost`. */
export function blendAverageCost(
  prevQty: number,
  prevAvg: number,
  qty: number,
  unitCost: number
): number {
  const totalQty = prevQty + qty;
  if (totalQty <= 0) return unitCost;
  return Math.round((prevQty * prevAvg + qty * unitCost) / totalQty);
}

/**
 * Record a stock RECEIPT (purchase, positive adjustment, return-in): bumps
 * quantityOnHand + totalValue, blends average cost (or opens a FIFO layer),
 * updates warehouseStock, and writes the inventoryMovement row. No GL posting.
 * Returns the movement id and the per-unit cost used.
 */
export async function recordInventoryReceipt(
  tx: Tx,
  args: {
    item: ValuedItem;
    quantity: number; // whole units, > 0
    unitCost: number; // cents per unit
    warehouseId?: string | null;
    type?: "purchase" | "adjustment" | "transfer_in" | "initial";
    referenceType?: string | null;
    referenceId?: string | null;
    createdBy?: string | null;
    receivedAt?: Date;
  }
): Promise<{ movementId: string; unitCost: number }> {
  const { item } = args;
  const qty = args.quantity;
  const value = args.unitCost * qty;
  const prevQty = item.quantityOnHand;
  const newQty = prevQty + qty;
  const newAvg = blendAverageCost(prevQty, item.averageCost, qty, args.unitCost);
  const newValue = item.totalValue + value;

  const [movement] = await tx
    .insert(inventoryMovement)
    .values({
      organizationId: item.organizationId,
      inventoryItemId: item.id,
      warehouseId: args.warehouseId ?? null,
      type: args.type ?? "purchase",
      quantity: qty,
      previousQuantity: prevQty,
      newQuantity: newQty,
      unitCost: args.unitCost,
      value,
      referenceType: args.referenceType ?? null,
      referenceId: args.referenceId ?? null,
      createdBy: args.createdBy ?? null,
    })
    .returning();

  await tx
    .update(inventoryItem)
    .set({ quantityOnHand: newQty, averageCost: newAvg, totalValue: newValue, updatedAt: new Date() })
    .where(eq(inventoryItem.id, item.id));

  if (item.costMethod === "fifo") {
    await tx.insert(inventoryCostLayer).values({
      organizationId: item.organizationId,
      inventoryItemId: item.id,
      warehouseId: args.warehouseId ?? null,
      originalQuantity: qty,
      remainingQuantity: qty,
      unitCost: args.unitCost,
      sourceMovementId: movement.id,
      ...(args.receivedAt ? { receivedAt: args.receivedAt } : {}),
    });
  }

  if (args.warehouseId) {
    await upsertWarehouseStock(tx, item.organizationId, item.id, args.warehouseId, qty);
  }

  return { movementId: movement.id, unitCost: args.unitCost };
}

/**
 * Record a stock ISSUE (sale, negative adjustment, return-out): decrements
 * quantityOnHand + totalValue and returns the cost of goods issued. Average
 * method values the issue at the current average; FIFO consumes oldest layers
 * first (recording which layers were consumed). No GL posting.
 */
export async function recordInventoryIssue(
  tx: Tx,
  args: {
    item: ValuedItem;
    quantity: number; // whole units, > 0
    warehouseId?: string | null;
    type?: "sale" | "adjustment" | "transfer_out";
    referenceType?: string | null;
    referenceId?: string | null;
    createdBy?: string | null;
  }
): Promise<{ movementId: string; cost: number }> {
  const { item } = args;
  const qty = args.quantity;
  const prevQty = item.quantityOnHand;
  const newQty = prevQty - qty;

  let cost: number;
  let consumptions: { costLayerId: string; quantity: number; unitCost: number }[] = [];

  if (item.costMethod === "fifo") {
    const consumed = await consumeFifoLayers(tx, item, qty);
    cost = consumed.totalCost;
    consumptions = consumed.consumptions;
  } else {
    // average / standard: value at current average unit cost
    cost = item.averageCost * qty;
  }

  const newValue = Math.max(0, item.totalValue - cost);

  const [movement] = await tx
    .insert(inventoryMovement)
    .values({
      organizationId: item.organizationId,
      inventoryItemId: item.id,
      warehouseId: args.warehouseId ?? null,
      type: args.type ?? "sale",
      quantity: -qty,
      previousQuantity: prevQty,
      newQuantity: newQty,
      unitCost: qty > 0 ? Math.round(cost / qty) : 0,
      value: -cost,
      referenceType: args.referenceType ?? null,
      referenceId: args.referenceId ?? null,
      createdBy: args.createdBy ?? null,
    })
    .returning();

  // average cost per unit is unchanged by an issue; only qty + total value drop
  await tx
    .update(inventoryItem)
    .set({ quantityOnHand: newQty, totalValue: newValue, updatedAt: new Date() })
    .where(eq(inventoryItem.id, item.id));

  if (consumptions.length > 0) {
    await tx.insert(inventoryLayerConsumption).values(
      consumptions.map((c) => ({
        issueMovementId: movement.id,
        costLayerId: c.costLayerId,
        quantity: c.quantity,
        unitCost: c.unitCost,
      }))
    );
  }

  if (args.warehouseId) {
    await upsertWarehouseStock(tx, item.organizationId, item.id, args.warehouseId, -qty);
  }

  return { movementId: movement.id, cost };
}

/**
 * Consume FIFO layers oldest-first for `qty` units, locking the rows so two
 * concurrent issues can't double-spend a layer. Returns the blended cost and
 * the per-layer consumption breakdown. Falls back to the item average for any
 * shortfall when layers don't cover the quantity (negative-on-hand guard).
 */
export async function consumeFifoLayers(
  tx: Tx,
  item: ValuedItem,
  qty: number
): Promise<{ totalCost: number; consumptions: { costLayerId: string; quantity: number; unitCost: number }[] }> {
  const layers = await tx
    .select()
    .from(inventoryCostLayer)
    .where(
      and(
        eq(inventoryCostLayer.organizationId, item.organizationId),
        eq(inventoryCostLayer.inventoryItemId, item.id),
        sql`${inventoryCostLayer.remainingQuantity} > 0`
      )
    )
    .orderBy(asc(inventoryCostLayer.receivedAt), asc(inventoryCostLayer.id))
    .for("update");

  let remaining = qty;
  let totalCost = 0;
  const consumptions: { costLayerId: string; quantity: number; unitCost: number }[] = [];

  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.remainingQuantity);
    totalCost += take * layer.unitCost;
    consumptions.push({ costLayerId: layer.id, quantity: take, unitCost: layer.unitCost });
    await tx
      .update(inventoryCostLayer)
      .set({ remainingQuantity: layer.remainingQuantity - take })
      .where(eq(inventoryCostLayer.id, layer.id));
    remaining -= take;
  }

  // Shortfall (issuing more than recorded layers): value the remainder at the
  // item's average cost so the issue still posts a sensible cost.
  if (remaining > 0) {
    totalCost += remaining * item.averageCost;
  }

  return { totalCost, consumptions };
}

/** Add (or subtract) a quantity to the per-warehouse stock row, creating it if needed. */
async function upsertWarehouseStock(
  tx: Tx,
  organizationId: string,
  inventoryItemId: string,
  warehouseId: string,
  qtyDelta: number
): Promise<void> {
  const existing = await tx.query.warehouseStock.findFirst({
    where: and(
      eq(warehouseStock.organizationId, organizationId),
      eq(warehouseStock.inventoryItemId, inventoryItemId),
      eq(warehouseStock.warehouseId, warehouseId)
    ),
  });
  if (existing) {
    await tx
      .update(warehouseStock)
      .set({ quantity: existing.quantity + qtyDelta, updatedAt: new Date() })
      .where(eq(warehouseStock.id, existing.id));
  } else {
    await tx.insert(warehouseStock).values({
      organizationId,
      inventoryItemId,
      warehouseId,
      quantity: qtyDelta,
    });
  }
}
