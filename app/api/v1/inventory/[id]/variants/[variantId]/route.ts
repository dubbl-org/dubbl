import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryVariant } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().nullable().optional(),
  purchasePrice: z.number().int().optional(),
  salePrice: z.number().int().optional(),
  quantityOnHand: z.number().int().optional(),
  options: z.record(z.string(), z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!item) return notFound("Inventory item");

    const existing = await db.query.inventoryVariant.findFirst({
      where: and(
        eq(inventoryVariant.id, variantId),
        eq(inventoryVariant.inventoryItemId, id),
        eq(inventoryVariant.organizationId, ctx.organizationId),
        notDeleted(inventoryVariant.deletedAt)
      ),
    });

    if (!existing) return notFound("Variant");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(inventoryVariant)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(inventoryVariant.id, variantId))
      .returning();

    return NextResponse.json({ inventoryVariant: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!item) return notFound("Inventory item");

    const existing = await db.query.inventoryVariant.findFirst({
      where: and(
        eq(inventoryVariant.id, variantId),
        eq(inventoryVariant.inventoryItemId, id),
        eq(inventoryVariant.organizationId, ctx.organizationId),
        notDeleted(inventoryVariant.deletedAt)
      ),
    });

    if (!existing) return notFound("Variant");

    await db
      .update(inventoryVariant)
      .set(softDelete())
      .where(eq(inventoryVariant.id, variantId));

    logAudit({
      ctx,
      action: "delete",
      entityType: "inventory_variant",
      entityId: variantId,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
