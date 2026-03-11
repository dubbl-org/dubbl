import { db } from "@/lib/db";
import { shiftDefinition } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  shiftType: z.enum(["regular", "overtime", "night", "weekend", "holiday"]).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  premiumPercent: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:shifts");

    const shift = await db.query.shiftDefinition.findFirst({
      where: and(
        eq(shiftDefinition.id, id),
        eq(shiftDefinition.organizationId, ctx.organizationId),
        notDeleted(shiftDefinition.deletedAt)
      ),
    });

    if (!shift) return notFound("Shift");
    return ok({ shift });
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
    requireRole(ctx, "manage:shifts");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(shiftDefinition)
      .set(parsed)
      .where(and(
        eq(shiftDefinition.id, id),
        eq(shiftDefinition.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Shift");

    logAudit({ ctx, action: "update", entityType: "shiftDefinition", entityId: id, changes: parsed, request });

    return ok({ shift: updated });
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
    requireRole(ctx, "manage:shifts");

    const [deleted] = await db
      .update(shiftDefinition)
      .set(softDelete())
      .where(and(
        eq(shiftDefinition.id, id),
        eq(shiftDefinition.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Shift");

    logAudit({ ctx, action: "delete", entityType: "shiftDefinition", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
