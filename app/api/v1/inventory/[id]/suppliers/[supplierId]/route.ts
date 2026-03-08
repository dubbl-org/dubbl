import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryItemSupplier } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  supplierCode: z.string().optional(),
  leadTimeDays: z.number().int().optional(),
  purchasePrice: z.number().int().optional(),
  isPreferred: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> }
) {
  try {
    const { id, supplierId } = await params;
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

    const existing = await db.query.inventoryItemSupplier.findFirst({
      where: and(
        eq(inventoryItemSupplier.id, supplierId),
        eq(inventoryItemSupplier.inventoryItemId, id),
        eq(inventoryItemSupplier.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Supplier link");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(inventoryItemSupplier)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(inventoryItemSupplier.id, supplierId))
      .returning();

    return NextResponse.json({ inventoryItemSupplier: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> }
) {
  try {
    const { id, supplierId } = await params;
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

    const existing = await db.query.inventoryItemSupplier.findFirst({
      where: and(
        eq(inventoryItemSupplier.id, supplierId),
        eq(inventoryItemSupplier.inventoryItemId, id),
        eq(inventoryItemSupplier.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Supplier link");

    await db
      .delete(inventoryItemSupplier)
      .where(eq(inventoryItemSupplier.id, supplierId));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
