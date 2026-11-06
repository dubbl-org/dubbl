import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { deleteCategory, updateCategory } from "@/lib/api/inventory-categories";

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
    const updated = await updateCategory(ctx.organizationId, id, parsed);

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

    // Items in it become uncategorised; sub-categories move to the top level.
    const deleted = await db.transaction((tx) => deleteCategory(tx, ctx.organizationId, id));

    if (!deleted) return notFound("Category");

    logAudit({
      ctx,
      action: "delete",
      entityType: "inventory_category",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
