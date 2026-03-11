import { db } from "@/lib/db";
import { compensationBand } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  level: z.string().nullable().optional(),
  minSalary: z.number().int().optional(),
  midSalary: z.number().int().optional(),
  maxSalary: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const band = await db.query.compensationBand.findFirst({
      where: and(
        eq(compensationBand.id, id),
        eq(compensationBand.organizationId, ctx.organizationId),
        notDeleted(compensationBand.deletedAt)
      ),
    });

    if (!band) return notFound("Compensation band");
    return ok({ band });
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
    requireRole(ctx, "manage:compensation");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(compensationBand)
      .set(parsed)
      .where(and(
        eq(compensationBand.id, id),
        eq(compensationBand.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Compensation band");

    logAudit({ ctx, action: "update", entityType: "compensationBand", entityId: id, changes: parsed, request });

    return ok({ band: updated });
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
    requireRole(ctx, "manage:compensation");

    const [deleted] = await db
      .update(compensationBand)
      .set(softDelete())
      .where(and(
        eq(compensationBand.id, id),
        eq(compensationBand.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Compensation band");

    logAudit({ ctx, action: "delete", entityType: "compensationBand", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
