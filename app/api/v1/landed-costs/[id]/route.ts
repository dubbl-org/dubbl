import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { landedCostAllocation } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const item = await db.query.landedCostAllocation.findFirst({
      where: and(
        eq(landedCostAllocation.id, id),
        eq(landedCostAllocation.organizationId, ctx.organizationId),
        notDeleted(landedCostAllocation.deletedAt)
      ),
      with: { components: true, lineAllocations: true, bill: true, purchaseOrder: { with: { lines: true } } },
    });
    if (!item) return notFound("Landed cost allocation");
    return NextResponse.json(item);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;
    const body = await request.json();
    const parsed = z.object({
      name: z.string().min(1).optional(),
      allocationMethod: z.enum(["by_value", "by_quantity", "by_weight", "manual"]).optional(),
    }).parse(body);

    const [updated] = await db
      .update(landedCostAllocation)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(
        eq(landedCostAllocation.id, id),
        eq(landedCostAllocation.organizationId, ctx.organizationId),
        notDeleted(landedCostAllocation.deletedAt)
      ))
      .returning();

    if (!updated) return notFound("Landed cost allocation");
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const [deleted] = await db
      .update(landedCostAllocation)
      .set(softDelete())
      .where(and(
        eq(landedCostAllocation.id, id),
        eq(landedCostAllocation.organizationId, ctx.organizationId),
        notDeleted(landedCostAllocation.deletedAt)
      ))
      .returning();

    if (!deleted) return notFound("Landed cost allocation");

    logAudit({
      ctx,
      action: "delete",
      entityType: "landed_cost",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
