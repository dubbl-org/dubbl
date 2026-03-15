import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { costCenter } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.costCenter.findFirst({
      where: and(
        eq(costCenter.id, id),
        eq(costCenter.organizationId, ctx.organizationId),
        notDeleted(costCenter.deletedAt)
      ),
      with: { parent: true },
    });

    if (!found) return notFound("Cost center");
    return NextResponse.json({ costCenter: found });
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
    requireRole(ctx, "manage:cost-centers");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.costCenter.findFirst({
      where: and(
        eq(costCenter.id, id),
        eq(costCenter.organizationId, ctx.organizationId),
        notDeleted(costCenter.deletedAt)
      ),
    });

    if (!existing) return notFound("Cost center");

    const [updated] = await db
      .update(costCenter)
      .set(parsed)
      .where(eq(costCenter.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "cost_center", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ costCenter: updated });
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
    requireRole(ctx, "manage:cost-centers");

    const existing = await db.query.costCenter.findFirst({
      where: and(
        eq(costCenter.id, id),
        eq(costCenter.organizationId, ctx.organizationId),
        notDeleted(costCenter.deletedAt)
      ),
    });

    if (!existing) return notFound("Cost center");

    await db
      .update(costCenter)
      .set(softDelete())
      .where(eq(costCenter.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "cost_center",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
