import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryMovement, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  createInventoryAdjustmentJournalEntry,
  ensureControlAccount,
  getNextEntryNumber,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
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

    const today = new Date().toISOString().slice(0, 10);

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
    const qty = existing.quantityOnHand;
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

    const newValue = prevValue + valueDelta;
    // Keep averageCost consistent with the carrying value at the same quantity.
    const newAvgCost = qty > 0 ? Math.round(newValue / qty) : 0;

    const result = await db.transaction(async (tx) => {
      const { base } = await resolveBaseRate(ctx.organizationId, undefined, today);
      const invAcct =
        (existing.inventoryAccountId ? { id: existing.inventoryAccountId } : null) ??
        (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
      const writeDownAcct = await ensureControlAccount(
        ctx.organizationId,
        "inventoryWriteDown",
        base,
        tx
      );
      if (!invAcct || !writeDownAcct) {
        throw new Error("Could not resolve inventory accounts for adjustment");
      }

      // Apply the valuation change to the item (quantity unchanged).
      await tx
        .update(inventoryItem)
        .set({ totalValue: newValue, averageCost: newAvgCost, updatedAt: new Date() })
        .where(eq(inventoryItem.id, id));

      const amount = Math.abs(valueDelta);
      const decrease = valueDelta < 0;
      const label =
        parsed.adjustmentType === "write_down"
          ? "Inventory write-down"
          : "Inventory revaluation";
      const description = `${label}${parsed.reason ? ` — ${parsed.reason}` : ""}`;

      // Movement: qty 0, value = signed value delta, unitCost 0.
      const [movement] = await tx
        .insert(inventoryMovement)
        .values({
          organizationId: ctx.organizationId,
          inventoryItemId: id,
          type: "adjustment",
          quantity: 0,
          previousQuantity: qty,
          newQuantity: qty,
          unitCost: 0,
          value: valueDelta,
          reason: description,
          referenceType: parsed.adjustmentType,
          referenceId: null,
          createdBy: ctx.userId,
        })
        .returning();

      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: today,
          description,
          reference: parsed.adjustmentType === "write_down" ? "INV-WD" : "INV-REVAL",
          status: "posted",
          sourceType:
            parsed.adjustmentType === "write_down"
              ? "inventory_write_down"
              : "inventory_revaluation",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      // Decrease in value: DR Write-Down 5020 / CR Inventory 1300.
      // Increase in value (revaluation up): DR Inventory 1300 / CR Write-Down 5020.
      await tx.insert(journalLine).values(
        decrease
          ? [
              { journalEntryId: entry.id, accountId: writeDownAcct.id, description: label, debitAmount: amount, creditAmount: 0, currencyCode: base },
              { journalEntryId: entry.id, accountId: invAcct.id, description: label, debitAmount: 0, creditAmount: amount, currencyCode: base },
            ]
          : [
              { journalEntryId: entry.id, accountId: invAcct.id, description: label, debitAmount: amount, creditAmount: 0, currencyCode: base },
              { journalEntryId: entry.id, accountId: writeDownAcct.id, description: label, debitAmount: 0, creditAmount: amount, currencyCode: base },
            ]
      );

      await tx
        .update(inventoryMovement)
        .set({ journalEntryId: entry.id })
        .where(eq(inventoryMovement.id, movement.id));

      return { movementId: movement.id, entryId: entry.id };
    });

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
