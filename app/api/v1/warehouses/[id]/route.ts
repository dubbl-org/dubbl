import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { warehouse } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";
import { deleteWarehouse, updateWarehouse } from "@/lib/api/warehouses";

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

    // Only one default location: making this one the default clears the others.
    const { existing, updated } = await updateWarehouse(ctx.organizationId, id, parsed);

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

    // Refuses while the location holds stock or has open transfers.
    const existing = await deleteWarehouse(ctx.organizationId, id);

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
