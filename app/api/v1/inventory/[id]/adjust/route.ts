import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryMovement } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const adjustSchema = z.object({
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
    const parsed = adjustSchema.parse(body);

    const existing = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!existing) return notFound("Inventory item");

    const newQuantity = existing.quantityOnHand + parsed.adjustment;
    if (newQuantity < 0) {
      return validationError("Adjustment would result in negative quantity");
    }

    const [updated] = await db
      .update(inventoryItem)
      .set({
        quantityOnHand: newQuantity,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItem.id, id))
      .returning();

    const [movement] = await db
      .insert(inventoryMovement)
      .values({
        organizationId: ctx.organizationId,
        inventoryItemId: id,
        type: "adjustment",
        quantity: parsed.adjustment,
        previousQuantity: existing.quantityOnHand,
        newQuantity,
        reason: parsed.reason,
        createdBy: ctx.userId,
      })
      .returning();

    return NextResponse.json({
      inventoryItem: updated,
      movement,
      adjustment: parsed.adjustment,
      reason: parsed.reason,
      previousQuantity: existing.quantityOnHand,
      newQuantity,
    });
  } catch (err) {
    return handleError(err);
  }
}
