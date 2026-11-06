import { db } from "@/lib/db";
import {
  inventoryItem,
  inventoryMovement,
  journalEntry,
  journalLine,
  stockTake,
  stockTakeLine,
  warehouse,
  warehouseStock,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { ensureControlAccount, getNextEntryNumber, resolveBaseRate } from "@/lib/api/journal-automation";
import { recordInventoryIssue, recordInventoryReceipt, type ValuedItem } from "@/lib/api/inventory-valuation";
import {
  assertInventoryPeriodOpen,
  fail,
  inventoryAccountFor,
  todayIso,
  type OpsContext,
  type Tx,
} from "@/lib/api/inventory-ops";

/**
 * Stocktakes (physical counts), shared by the REST routes and the MCP tools.
 *
 *   Draft        set up, nobody has started counting
 *   In progress  counting; expected quantities were refreshed at the start
 *   Completed    applied: stock was corrected to the counts and the value of
 *                every difference was posted
 *   Cancelled    stopped, nothing was posted
 *
 * A stocktake for one location compares counts with that location's stock;
 * a stocktake for all locations compares with company-wide stock on hand.
 */

const DETAIL_WITH = {
  warehouse: { columns: { id: true, name: true, code: true } },
  lines: {
    with: { inventoryItem: { columns: { id: true, name: true, code: true } } },
  },
} as const;

export async function listStockTakes(organizationId: string) {
  const rows = await db.query.stockTake.findMany({
    where: eq(stockTake.organizationId, organizationId),
    orderBy: desc(stockTake.createdAt),
    with: { lines: { columns: { id: true, countedQuantity: true, discrepancy: true } }, warehouse: { columns: { id: true, name: true } } },
  });
  return rows.map(({ lines, ...st }) => ({
    ...st,
    itemCount: lines.length,
    countedCount: lines.filter((l) => l.countedQuantity !== null).length,
    discrepancyCount: lines.filter((l) => l.countedQuantity !== null && (l.discrepancy ?? 0) !== 0).length,
  }));
}

export async function getStockTake(organizationId: string, id: string) {
  return db.query.stockTake.findFirst({
    where: and(eq(stockTake.id, id), eq(stockTake.organizationId, organizationId)),
    with: DETAIL_WITH,
  });
}

async function loadStockTake(exec: Tx | typeof db, organizationId: string, id: string) {
  const st = await exec.query.stockTake.findFirst({
    where: and(eq(stockTake.id, id), eq(stockTake.organizationId, organizationId)),
  });
  if (!st) fail("Stocktake not found", 404);
  return st;
}

/** Live quantity per item: one location's stock, or company-wide on hand. */
async function liveQuantities(exec: Tx | typeof db, organizationId: string, warehouseId: string | null, itemIds: string[]) {
  const out = new Map<string, number>();
  if (itemIds.length === 0) return out;
  if (warehouseId) {
    const rows = await exec
      .select({ itemId: warehouseStock.inventoryItemId, quantity: warehouseStock.quantity })
      .from(warehouseStock)
      .where(
        and(
          eq(warehouseStock.organizationId, organizationId),
          eq(warehouseStock.warehouseId, warehouseId),
          inArray(warehouseStock.inventoryItemId, itemIds)
        )
      );
    for (const r of rows) out.set(r.itemId, r.quantity);
  } else {
    const rows = await exec
      .select({ id: inventoryItem.id, quantity: inventoryItem.quantityOnHand })
      .from(inventoryItem)
      .where(and(eq(inventoryItem.organizationId, organizationId), inArray(inventoryItem.id, itemIds)));
    for (const r of rows) out.set(r.id, r.quantity);
  }
  return out;
}

/** Create a draft stocktake with a count line for every active item. */
export async function createStockTake(
  ctx: OpsContext,
  input: { name: string; warehouseId?: string | null; notes?: string | null }
) {
  const warehouseId = input.warehouseId || null;
  if (warehouseId) {
    const place = await db.query.warehouse.findFirst({
      where: and(eq(warehouse.id, warehouseId), eq(warehouse.organizationId, ctx.organizationId), notDeleted(warehouse.deletedAt)),
      columns: { id: true },
    });
    if (!place) fail("Location not found", 404);
  }

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(stockTake)
      .values({
        organizationId: ctx.organizationId,
        name: input.name,
        warehouseId,
        notes: input.notes ?? null,
        status: "draft",
        createdBy: ctx.userId,
      })
      .returning();

    const items = await tx
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          eq(inventoryItem.isActive, true),
          notDeleted(inventoryItem.deletedAt)
        )
      );
    const live = await liveQuantities(tx, ctx.organizationId, warehouseId, items.map((i) => i.id));
    if (items.length > 0) {
      await tx.insert(stockTakeLine).values(
        items.map((item) => ({
          stockTakeId: created.id,
          inventoryItemId: item.id,
          expectedQuantity: live.get(item.id) ?? 0,
        }))
      );
    }
    return created.id;
  });
  return getStockTake(ctx.organizationId, id);
}

/** Rename or change the notes. Status changes go through start/cancel/apply. */
export async function updateStockTakeDetails(
  ctx: OpsContext,
  id: string,
  input: { name?: string; notes?: string | null }
) {
  const st = await loadStockTake(db, ctx.organizationId, id);
  if (st.status === "completed" || st.status === "cancelled") fail("A finished stocktake can't be changed");
  await db
    .update(stockTake)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(stockTake.id, id));
  return getStockTake(ctx.organizationId, id);
}

/** Start counting: expected quantities are refreshed from today's stock. */
export async function startStockTake(ctx: OpsContext, id: string) {
  await db.transaction(async (tx) => {
    const st = await loadStockTake(tx, ctx.organizationId, id);
    if (st.status !== "draft") fail(st.status === "in_progress" ? "Counting has already started" : "Only a draft stocktake can be started");
    const lines = await tx.query.stockTakeLine.findMany({ where: eq(stockTakeLine.stockTakeId, id) });
    const live = await liveQuantities(tx, ctx.organizationId, st.warehouseId, lines.map((l) => l.inventoryItemId));
    for (const line of lines) {
      const expected = live.get(line.inventoryItemId) ?? 0;
      if (expected === line.expectedQuantity) continue;
      await tx
        .update(stockTakeLine)
        .set({
          expectedQuantity: expected,
          discrepancy: line.countedQuantity === null ? null : line.countedQuantity - expected,
          updatedAt: new Date(),
        })
        .where(eq(stockTakeLine.id, line.id));
    }
    const [row] = await tx
      .update(stockTake)
      .set({ status: "in_progress", startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stockTake.id, id), eq(stockTake.status, "draft")))
      .returning({ id: stockTake.id });
    if (!row) fail("This stocktake was changed by someone else. Refresh and try again.", 409);
  });
  return getStockTake(ctx.organizationId, id);
}

/** Record (or change) the counted quantity on one line, by line id or item id. */
export async function recordStockTakeCount(
  ctx: OpsContext,
  id: string,
  target: { lineId?: string; inventoryItemId?: string },
  countedQuantity: number
) {
  if (!Number.isInteger(countedQuantity) || countedQuantity < 0) fail("Counted quantity must be a whole number, 0 or more");
  const st = await loadStockTake(db, ctx.organizationId, id);
  if (st.status !== "in_progress") fail("Start counting before recording counts");
  if (!target.lineId && !target.inventoryItemId) fail("Say which line or item was counted");

  const line = await db.query.stockTakeLine.findFirst({
    where: and(
      eq(stockTakeLine.stockTakeId, id),
      target.lineId
        ? eq(stockTakeLine.id, target.lineId)
        : eq(stockTakeLine.inventoryItemId, target.inventoryItemId!)
    ),
  });
  if (!line) fail("That item isn't on this stocktake", 404);

  const [updated] = await db
    .update(stockTakeLine)
    .set({ countedQuantity, discrepancy: countedQuantity - line.expectedQuantity, updatedAt: new Date() })
    .where(eq(stockTakeLine.id, line.id))
    .returning();
  return updated;
}

export async function cancelStockTake(ctx: OpsContext, id: string) {
  const st = await loadStockTake(db, ctx.organizationId, id);
  if (st.status === "completed") fail("A completed stocktake can't be cancelled");
  if (st.status === "cancelled") fail("Stocktake is already cancelled");
  const [row] = await db
    .update(stockTake)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(stockTake.id, id), eq(stockTake.status, st.status)))
    .returning({ id: stockTake.id });
  if (!row) fail("This stocktake was changed by someone else. Refresh and try again.", 409);
  return getStockTake(ctx.organizationId, id);
}

/** Delete a stocktake that hasn't started yet. */
export async function deleteStockTake(ctx: OpsContext, id: string) {
  const st = await loadStockTake(db, ctx.organizationId, id);
  if (st.status !== "draft") fail("Only a stocktake that hasn't started can be deleted. Cancel it instead.");
  await db.transaction(async (tx) => {
    await tx.delete(stockTakeLine).where(eq(stockTakeLine.stockTakeId, id));
    await tx.delete(stockTake).where(eq(stockTake.id, id));
  });
  return st;
}

/**
 * Apply the counts. Every counted line is compared with live stock (the
 * location's stock for a location stocktake, company-wide otherwise), so stock
 * that moved since counting started is still corrected exactly to the count.
 *
 *   shortage: issue at cost      DR Inventory Shrinkage 5010 / CR Inventory
 *   overage:  receive at average DR Inventory / CR Inventory Shrinkage 5010
 *
 * Everything runs in one transaction. Uncounted lines are left alone.
 */
export async function applyStockTake(ctx: OpsContext, id: string, date = todayIso()) {
  await assertInventoryPeriodOpen(ctx.organizationId, date, ctx);

  const result = await db.transaction(async (tx) => {
    const st = await loadStockTake(tx, ctx.organizationId, id);
    if (st.status !== "in_progress") fail("Start counting before applying the stocktake");
    // Claim the stocktake first so a double click can't post twice.
    const [claimed] = await tx
      .update(stockTake)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stockTake.id, id), eq(stockTake.status, "in_progress")))
      .returning({ id: stockTake.id });
    if (!claimed) fail("This stocktake was changed by someone else. Refresh and try again.", 409);

    const lines = (await tx.query.stockTakeLine.findMany({ where: eq(stockTakeLine.stockTakeId, id) })).filter(
      (l) => l.countedQuantity !== null
    );
    const live = await liveQuantities(tx, ctx.organizationId, st.warehouseId, lines.map((l) => l.inventoryItemId));
    const { base } = await resolveBaseRate(ctx.organizationId, undefined, date);
    const shrinkAcct = await ensureControlAccount(ctx.organizationId, "inventoryShrinkage", base, tx);
    if (!shrinkAcct) fail("Couldn't find or create the Inventory Shrinkage account", 500);

    let adjustedCount = 0;
    const journalEntryIds: string[] = [];

    for (const line of lines) {
      const counted = line.countedQuantity!;
      const delta = counted - (live.get(line.inventoryItemId) ?? 0);
      if (delta === 0) {
        await tx
          .update(stockTakeLine)
          .set({ adjusted: true, valueAdjustment: 0, discrepancy: counted - line.expectedQuantity, updatedAt: new Date() })
          .where(eq(stockTakeLine.id, line.id));
        continue;
      }

      // Re-read inside the transaction so costs and quantities are current.
      const item = await tx.query.inventoryItem.findFirst({
        where: and(eq(inventoryItem.id, line.inventoryItemId), eq(inventoryItem.organizationId, ctx.organizationId)),
      });
      if (!item) continue;

      const shortage = delta < 0;
      if (shortage && -delta > item.quantityOnHand) {
        fail(
          `${item.name}: the count is ${-delta} below this location's stock, but only ${item.quantityOnHand} are on hand company-wide. Check the location's stock with a transfer first.`,
          409
        );
      }

      let movementId: string;
      let glValue: number;
      if (shortage) {
        const r = await recordInventoryIssue(tx, {
          item: item as ValuedItem,
          quantity: -delta,
          warehouseId: st.warehouseId,
          type: "adjustment",
          referenceType: "stock_take",
          referenceId: st.id,
          createdBy: ctx.userId,
        });
        movementId = r.movementId;
        glValue = r.cost;
      } else {
        const r = await recordInventoryReceipt(tx, {
          item: item as ValuedItem,
          quantity: delta,
          unitCost: item.averageCost,
          warehouseId: st.warehouseId,
          type: "adjustment",
          referenceType: "stock_take",
          referenceId: st.id,
          createdBy: ctx.userId,
        });
        movementId = r.movementId;
        glValue = item.averageCost * delta;
      }
      await tx
        .update(inventoryMovement)
        .set({ type: "stock_take", reason: `Stock take: ${st.name}` })
        .where(eq(inventoryMovement.id, movementId));

      let entryId: string | null = null;
      if (glValue !== 0) {
        const invAcct = await inventoryAccountFor(ctx.organizationId, item, base, tx);
        const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
        const description = `Stock take ${st.name} ${shortage ? "shortage" : "overage"}: ${item.name}`;
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date,
            description,
            reference: `STK-${st.id.slice(0, 8)}`,
            status: "posted",
            sourceType: "stock_take",
            sourceId: st.id,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        entryId = entry.id;
        journalEntryIds.push(entry.id);
        const [dr, cr] = shortage ? [shrinkAcct.id, invAcct.id] : [invAcct.id, shrinkAcct.id];
        await tx.insert(journalLine).values([
          { journalEntryId: entry.id, accountId: dr, description, debitAmount: glValue, creditAmount: 0, currencyCode: base },
          { journalEntryId: entry.id, accountId: cr, description, debitAmount: 0, creditAmount: glValue, currencyCode: base },
        ]);
        await tx.update(inventoryMovement).set({ journalEntryId: entry.id }).where(eq(inventoryMovement.id, movementId));
      }

      await tx
        .update(stockTakeLine)
        .set({
          adjusted: true,
          discrepancy: counted - line.expectedQuantity,
          valueAdjustment: shortage ? -glValue : glValue,
          journalEntryId: entryId,
          updatedAt: new Date(),
        })
        .where(eq(stockTakeLine.id, line.id));
      adjustedCount++;
    }
    return { adjustedCount, journalEntryIds };
  });

  return { stockTake: await getStockTake(ctx.organizationId, id), ...result };
}
