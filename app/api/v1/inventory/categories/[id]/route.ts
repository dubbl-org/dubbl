import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryCategory } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(inventoryCategory)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryCategory.id, id),
          eq(inventoryCategory.organizationId, ctx.organizationId),
          notDeleted(inventoryCategory.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Category");

    return NextResponse.json({ category: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const [deleted] = await db
      .update(inventoryCategory)
      .set(softDelete())
      .where(
        and(
          eq(inventoryCategory.id, id),
          eq(inventoryCategory.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!deleted) return notFound("Category");

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
