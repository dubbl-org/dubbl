import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceList, priceListItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, error } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import type { AuthContext } from "@/lib/api/auth-context";

// Confirm the price list exists and is owned by the caller's org.
async function loadOwnedList(ctx: AuthContext, listId: string) {
  return db.query.priceList.findFirst({
    where: and(
      eq(priceList.id, listId),
      eq(priceList.organizationId, ctx.organizationId),
      notDeleted(priceList.deletedAt)
    ),
  });
}

const updateSchema = z.object({
  unitPrice: z.number().int().min(0).optional(),
  minQuantity: z.number().int().min(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const list = await loadOwnedList(ctx, id);
    if (!list) return notFound("Price list");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const row = await db.query.priceListItem.findFirst({
      where: and(
        eq(priceListItem.id, itemId),
        eq(priceListItem.priceListId, id)
      ),
    });
    if (!row) return notFound("Price list item");

    // If retiering, keep one row per (list, item, tier).
    if (parsed.minQuantity !== undefined && parsed.minQuantity !== row.minQuantity) {
      const clash = await db.query.priceListItem.findFirst({
        where: and(
          eq(priceListItem.priceListId, id),
          eq(priceListItem.inventoryItemId, row.inventoryItemId),
          eq(priceListItem.minQuantity, parsed.minQuantity)
        ),
      });
      if (clash) {
        return error(
          "A price already exists for this item at this minimum quantity",
          409
        );
      }
    }

    const [updated] = await db
      .update(priceListItem)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(priceListItem.id, itemId))
      .returning();

    logAudit({
      ctx,
      action: "update",
      entityType: "price_list_item",
      entityId: itemId,
      changes: parsed as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ priceListItem: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const list = await loadOwnedList(ctx, id);
    if (!list) return notFound("Price list");

    const [deleted] = await db
      .delete(priceListItem)
      .where(
        and(eq(priceListItem.id, itemId), eq(priceListItem.priceListId, id))
      )
      .returning();

    if (!deleted) return notFound("Price list item");

    logAudit({
      ctx,
      action: "delete",
      entityType: "price_list_item",
      entityId: itemId,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
