import { db } from "@/lib/db";
import { compensationReview } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  effectiveDate: z.string().min(1),
  totalBudget: z.number().int().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const reviews = await db.query.compensationReview.findMany({
      where: and(
        eq(compensationReview.organizationId, ctx.organizationId),
        notDeleted(compensationReview.deletedAt)
      ),
      orderBy: desc(compensationReview.createdAt),
    });

    return ok({ data: reviews });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [review] = await db
      .insert(compensationReview)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "compensationReview", entityId: review.id, request });

    return created({ review });
  } catch (err) {
    return handleError(err);
  }
}
