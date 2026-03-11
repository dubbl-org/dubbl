import { db } from "@/lib/db";
import { compensationReview } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  effectiveDate: z.string().optional(),
  status: z.enum(["draft", "in_progress", "completed", "cancelled"]).optional(),
  totalBudget: z.number().int().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const review = await db.query.compensationReview.findFirst({
      where: and(
        eq(compensationReview.id, id),
        eq(compensationReview.organizationId, ctx.organizationId),
        notDeleted(compensationReview.deletedAt)
      ),
      with: { entries: { with: { employee: true } } },
    });

    if (!review) return notFound("Compensation review");
    return ok({ review });
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
      .update(compensationReview)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(
        eq(compensationReview.id, id),
        eq(compensationReview.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Compensation review");

    logAudit({ ctx, action: "update", entityType: "compensationReview", entityId: id, changes: parsed, request });

    return ok({ review: updated });
  } catch (err) {
    return handleError(err);
  }
}
