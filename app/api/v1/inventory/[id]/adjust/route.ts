import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryMovement } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { createInventoryAdjustmentJournalEntry } from "@/lib/api/journal-automation";
import { assertInventoryPeriodOpen, postInventoryValueChange, todayIso } from "@/lib/api/inventory-ops";
import type { ValuedItem } from "@/lib/api/inventory-valuation";
import { z } from "zod";

/**
 * Inventory adjustment route. Supports three accounting-distinct kinds:
 *
 *  • "quantity"   — change on-hand units (shrinkage / found stock). Values the
 *                   delta via the cost-flow engine and posts shrinkage 5010.
 *                   (Default, for backward compatibility with the old payload.)
 *
 *  • "write_down" — lower-of-cost-or-NRV impairment. Quantity is UNCHANGED; the
 *                   book value (totalValue) and averageCost drop by `valueDelta`
 *                   (a positive reduction in cents). Posts DR Inventory
 *                   Write-Down 5020 / CR Inventory 1300. Writes a qty-0 movement
 *                   carrying the negative value delta.
 *
 *  • "revaluation" — set the carrying value directly (e.g. mark-to-market).
 *                   Quantity is UNCHANGED; averageCost/totalValue are set from
 *                   `newTotalValue`. Posts the delta between Inventory 1300 and
 *                   Inventory Write-Down 5020 (decrease: DR 5020 / CR 1300;
 *                   increase: DR 1300 / CR 5020). Writes a qty-0 movement.
 *                   The MCP adjust_inventory_stock tool posts the same way
 *                   (both use postInventoryValueChange).
 */
const adjustSchema = z.discriminatedUnion("adjustmentType", [
  z.object({
    adjustmentType: z.literal("quantity"),
    adjustment: z.number().int(),
    reason: z.string().min(1),
  }),
  z.object({
    adjustmentType: z.literal("write_down"),
    // Positive number of cents to write the on-hand value down by.
    valueDelta: z.number().int().positive(),
    reason: z.string().min(1),
  }),
  z.object({
    adjustmentType: z.literal("revaluation"),
    // New total on-hand book value in cents (>= 0).
    newTotalValue: z.number().int().min(0),
    reason: z.string().min(1),
  }),
]);

// Back-compat: a payload with just { adjustment, reason } (no adjustmentType)
// is treated as a quantity adjustment.
const legacySchema = z.object({
  adjustment: z.number().int(),
  reason: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed =
      body && typeof body === "object" && "adjustmentType" in body
        ? adjustSchema.parse(body)
        : { adjustmentType: "quantity" as const, ...legacySchema.parse(body) };

    const existing = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!existing) return notFound("Inventory item");

    const today = todayIso();
    await assertInventoryPeriodOpen(ctx.organizationId, today, ctx);

    if (parsed.adjustmentType === "quantity") {
      const newQuantity = existing.quantityOnHand + parsed.adjustment;
      if (newQuantity < 0) {
        return validationError("Adjustment would result in negative quantity");
      }

      // Record the movement + valuation change AND post the shrinkage/found GL
      // entry (DR Inventory Shrinkage / CR Inventory for a loss, reversed for found).
      const result = await db.transaction(async (tx) =>
        createInventoryAdjustmentJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            item: existing as ValuedItem & { inventoryAccountId?: string | null },
            qtyDelta: parsed.adjustment,
            reason: parsed.reason,
            date: today,
          },
          tx
        )
      );

      const updated = await db.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, id) });
      const movement = result
        ? await db.query.inventoryMovement.findFirst({ where: eq(inventoryMovement.id, result.movementId) })
        : null;

      await logAudit({
        ctx,
        action: "inventory.adjust",
        entityType: "inventory_item",
        entityId: id,
        changes: {
          adjustmentType: "quantity",
          adjustment: parsed.adjustment,
          reason: parsed.reason,
          journalEntryId: result?.entryId ?? null,
        },
        request,
      });

      return NextResponse.json({
        inventoryItem: updated,
        movement,
        journalEntryId: result?.entryId ?? null,
        adjustmentType: "quantity",
        adjustment: parsed.adjustment,
        reason: parsed.reason,
        previousQuantity: existing.quantityOnHand,
        newQuantity,
      });
    }

    // --- Value-only adjustments (write_down / revaluation): qty UNCHANGED. ---
    const prevValue = existing.totalValue;

    // valueDelta is the SIGNED change to the book value (negative = decrease).
    let valueDelta: number;
    if (parsed.adjustmentType === "write_down") {
      // Cannot write down by more than the current carrying value.
      if (parsed.valueDelta > prevValue) {
        return validationError("Write-down exceeds current inventory value");
      }
      valueDelta = -parsed.valueDelta;
    } else {
      // revaluation: set the new carrying value directly.
      valueDelta = parsed.newTotalValue - prevValue;
    }

    if (valueDelta === 0) {
      return NextResponse.json({
        inventoryItem: existing,
        movement: null,
        journalEntryId: null,
        adjustmentType: parsed.adjustmentType,
        previousValue: prevValue,
        newValue: prevValue,
        reason: parsed.reason,
      });
    }

    // Same posting as the MCP tool: down DR 5020 / CR Inventory, up the reverse.
    const result = await postInventoryValueChange(ctx, {
      itemId: id,
      valueDelta,
      kind: parsed.adjustmentType,
      reason: parsed.reason,
      date: today,
    });
    const newValue = result.newValue;

    const updated = await db.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, id) });
    const movement = await db.query.inventoryMovement.findFirst({
      where: eq(inventoryMovement.id, result.movementId),
    });

    await logAudit({
      ctx,
      action: "inventory.adjust",
      entityType: "inventory_item",
      entityId: id,
      changes: {
        adjustmentType: parsed.adjustmentType,
        valueDelta,
        previousValue: prevValue,
        newValue,
        reason: parsed.reason,
        journalEntryId: result.entryId,
      },
      request,
    });

    return NextResponse.json({
      inventoryItem: updated,
      movement,
      journalEntryId: result.entryId,
      adjustmentType: parsed.adjustmentType,
      previousValue: prevValue,
      newValue,
      reason: parsed.reason,
    });
  } catch (err) {
    return handleError(err);
  }
}
