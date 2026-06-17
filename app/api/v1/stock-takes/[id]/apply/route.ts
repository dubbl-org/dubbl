import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  stockTake,
  stockTakeLine,
  inventoryItem,
  inventoryMovement,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  ensureControlAccount,
  getNextEntryNumber,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import {
  recordInventoryReceipt,
  recordInventoryIssue,
  type ValuedItem,
} from "@/lib/api/inventory-valuation";

/**
 * Apply a stock take: for every counted line whose count differs from the
 * system quantity, true up on-hand inventory through the cost-flow engine and
 * post the GL value of the discrepancy.
 *
 *   shortage (counted < system): issue the shortfall at cost
 *                                → DR Inventory Shrinkage 5010 / CR Inventory 1300
 *   overage  (counted > system): receive the surplus at the current average cost
 *                                → DR Inventory 1300 / CR Inventory Shrinkage 5010
 *
 * All movements + GL post inside ONE transaction so a count batch is atomic.
 * Each discrepancy is a single inventoryMovement (type stock_take) carrying the
 * signed value/unitCost and stamped with the posted journalEntryId; the
 * stockTakeLine records the GL value (valueAdjustment) + journalEntryId.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const st = await db.query.stockTake.findFirst({
      where: and(
        eq(stockTake.id, id),
        eq(stockTake.organizationId, ctx.organizationId)
      ),
      with: {
        lines: true,
      },
    });

    if (!st) {
      return notFound("Stock take");
    }

    if (st.status !== "in_progress") {
      return NextResponse.json(
        { error: "Stock take must be in progress to apply adjustments" },
        { status: 400 }
      );
    }

    // Only counted lines whose count differs from the system quantity.
    const linesToAdjust = st.lines.filter(
      (line) => line.countedQuantity !== null && line.discrepancy !== 0
    );

    const today = new Date().toISOString().slice(0, 10);

    const adjustedCount = await db.transaction(async (tx) => {
      const { base } = await resolveBaseRate(ctx.organizationId, undefined, today);
      const shrinkAcct = await ensureControlAccount(
        ctx.organizationId,
        "inventoryShrinkage",
        base,
        tx
      );
      if (!shrinkAcct) {
        throw new Error("Could not resolve Inventory Shrinkage account");
      }

      let applied = 0;

      for (const line of linesToAdjust) {
        const item = await tx.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, line.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId)
          ),
        });
        if (!item) continue;

        const previousQuantity = item.quantityOnHand;
        const counted = line.countedQuantity!;
        // True discrepancy against the live system quantity (the stored
        // line.discrepancy was computed when the line was counted; re-derive so
        // we never over/under-adjust if stock moved since).
        const delta = counted - previousQuantity;
        if (delta === 0) {
          await tx
            .update(stockTakeLine)
            .set({ adjusted: true, updatedAt: new Date() })
            .where(eq(stockTakeLine.id, line.id));
          continue;
        }

        const invAcct =
          (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
          (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
        if (!invAcct) continue;

        // Move stock through the cost-flow engine. Shortage = issue at cost,
        // overage = receive at the current average cost.
        let movementId: string;
        let glValue: number; // positive cents value of the discrepancy
        const shortage = delta < 0;
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

        // Re-label the engine-created movement as a stock-take movement and
        // carry the stock take name for traceability.
        await tx
          .update(inventoryMovement)
          .set({
            type: "stock_take",
            reason: `Stock take: ${st.name}`,
          })
          .where(eq(inventoryMovement.id, movementId));

        // Post the GL value of the discrepancy (skip a zero-cost movement, e.g.
        // an item with no recorded cost — quantity still trued up above).
        let entryId: string | null = null;
        if (glValue !== 0) {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const description = `Stock take ${st.name}${shortage ? " shortage" : " overage"}`;
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: today,
              description,
              reference: `STK-${st.id.slice(0, 8)}`,
              status: "posted",
              sourceType: "stock_take",
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();
          entryId = entry.id;

          // shortage: DR Shrinkage / CR Inventory. overage: DR Inventory / CR Shrinkage.
          await tx.insert(journalLine).values(
            shortage
              ? [
                  { journalEntryId: entry.id, accountId: shrinkAcct.id, description, debitAmount: glValue, creditAmount: 0, currencyCode: base },
                  { journalEntryId: entry.id, accountId: invAcct.id, description, debitAmount: 0, creditAmount: glValue, currencyCode: base },
                ]
              : [
                  { journalEntryId: entry.id, accountId: invAcct.id, description, debitAmount: glValue, creditAmount: 0, currencyCode: base },
                  { journalEntryId: entry.id, accountId: shrinkAcct.id, description, debitAmount: 0, creditAmount: glValue, currencyCode: base },
                ]
          );

          await tx
            .update(inventoryMovement)
            .set({ journalEntryId: entry.id })
            .where(eq(inventoryMovement.id, movementId));
        }

        // Record the GL true-up value on the line: signed (negative for a
        // shortage, positive for an overage).
        await tx
          .update(stockTakeLine)
          .set({
            adjusted: true,
            valueAdjustment: shortage ? -glValue : glValue,
            journalEntryId: entryId,
            updatedAt: new Date(),
          })
          .where(eq(stockTakeLine.id, line.id));

        applied++;
      }

      await tx
        .update(stockTake)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stockTake.id, id));

      return applied;
    });

    await logAudit({
      ctx,
      action: "stock_take.apply",
      entityType: "stock_take",
      entityId: id,
      changes: { adjustedCount },
      request,
    });

    const updatedSt = await db.query.stockTake.findFirst({
      where: and(eq(stockTake.id, id), eq(stockTake.organizationId, ctx.organizationId)),
      with: {
        lines: {
          with: {
            inventoryItem: {
              columns: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ stockTake: updatedSt, adjustedCount });
  } catch (err) {
    return handleError(err);
  }
}
