import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxRate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  rate: z.number().int().min(0).optional(),
  type: z.enum(["sales", "purchase", "both"]).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.id, id),
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
      with: { components: true },
    });

    if (!found) return notFound("Tax rate");
    return NextResponse.json({ taxRate: found });
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
    requireRole(ctx, "manage:tax-rates");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.id, id),
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
    });

    if (!existing) return notFound("Tax rate");

    const [updated] = await db
      .update(taxRate)
      .set(parsed)
      .where(eq(taxRate.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "tax_rate", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ taxRate: updated });
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
    requireRole(ctx, "manage:tax-rates");

    const existing = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.id, id),
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
    });

    if (!existing) return notFound("Tax rate");

    await db
      .update(taxRate)
      .set(softDelete())
      .where(eq(taxRate.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "tax_rate",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
