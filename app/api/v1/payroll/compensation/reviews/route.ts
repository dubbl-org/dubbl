import { db } from "@/lib/db";
import { compensationReview, compensationReviewEntry } from "@/lib/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalBudget: z.number().int().min(0).optional(), // cents
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

    // Entry counts per review, for the "Total Entries" stat and the list rows
    const counts = reviews.length
      ? await db
          .select({
            reviewId: compensationReviewEntry.reviewId,
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(compensationReviewEntry)
          .where(inArray(compensationReviewEntry.reviewId, reviews.map((r) => r.id)))
          .groupBy(compensationReviewEntry.reviewId)
      : [];
    const countByReview = new Map(counts.map((c) => [c.reviewId, c.count]));

    return ok({
      data: reviews.map((r) => ({ ...r, _count: { entries: countByReview.get(r.id) ?? 0 } })),
    });
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
