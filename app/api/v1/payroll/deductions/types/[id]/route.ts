import { db } from "@/lib/db";
import { deductionType } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.enum(["pre_tax", "post_tax"]).optional(),
  defaultAmount: z.number().int().nullable().optional(),
  defaultPercent: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const dt = await db.query.deductionType.findFirst({
      where: and(
        eq(deductionType.id, id),
        eq(deductionType.organizationId, ctx.organizationId),
        notDeleted(deductionType.deletedAt)
      ),
    });

    if (!dt) return notFound("Deduction type");
    return ok({ deductionType: dt });
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
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(deductionType)
      .set(parsed)
      .where(and(
        eq(deductionType.id, id),
        eq(deductionType.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Deduction type");

    logAudit({ ctx, action: "update", entityType: "deductionType", entityId: id, changes: parsed, request });

    return ok({ deductionType: updated });
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
    requireRole(ctx, "manage:payroll");

    const [deleted] = await db
      .update(deductionType)
      .set(softDelete())
      .where(and(
        eq(deductionType.id, id),
        eq(deductionType.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Deduction type");

    logAudit({ ctx, action: "delete", entityType: "deductionType", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
