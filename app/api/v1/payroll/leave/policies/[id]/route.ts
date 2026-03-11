import { db } from "@/lib/db";
import { leavePolicy } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  accrualMethod: z.enum(["per_pay_period", "monthly", "annually", "front_loaded"]).optional(),
  accrualRate: z.number().min(0).optional(),
  maxBalance: z.number().nullable().optional(),
  carryOverMax: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const policy = await db.query.leavePolicy.findFirst({
      where: and(
        eq(leavePolicy.id, id),
        eq(leavePolicy.organizationId, ctx.organizationId),
        notDeleted(leavePolicy.deletedAt)
      ),
    });

    if (!policy) return notFound("Leave policy");
    return ok({ policy });
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
    requireRole(ctx, "manage:leave");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(leavePolicy)
      .set(parsed)
      .where(and(
        eq(leavePolicy.id, id),
        eq(leavePolicy.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Leave policy");

    logAudit({ ctx, action: "update", entityType: "leavePolicy", entityId: id, changes: parsed, request });

    return ok({ policy: updated });
  } catch (err) {
    return handleError(err);
  }
}
