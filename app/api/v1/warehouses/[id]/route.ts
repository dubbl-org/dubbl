import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { warehouse } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.warehouse.findFirst({
      where: and(
        eq(warehouse.id, id),
        eq(warehouse.organizationId, ctx.organizationId),
        notDeleted(warehouse.deletedAt)
      ),
    });

    if (!found) return notFound("Warehouse");
    return NextResponse.json({ warehouse: found });
  } catch (err) {
    return handleError(err);
  }
}

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

    const existing = await db.query.warehouse.findFirst({
      where: and(
        eq(warehouse.id, id),
        eq(warehouse.organizationId, ctx.organizationId),
        notDeleted(warehouse.deletedAt)
      ),
    });

    if (!existing) return notFound("Warehouse");

    const [updated] = await db
      .update(warehouse)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(warehouse.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "warehouse", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ warehouse: updated });
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

    const existing = await db.query.warehouse.findFirst({
      where: and(
        eq(warehouse.id, id),
        eq(warehouse.organizationId, ctx.organizationId),
        notDeleted(warehouse.deletedAt)
      ),
    });

    if (!existing) return notFound("Warehouse");

    await db
      .update(warehouse)
      .set(softDelete())
      .where(eq(warehouse.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "warehouse",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
