import { db } from "@/lib/db";
import { compensationReviewEntry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { z } from "zod";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  currentSalary: z.number().int(),
  proposedSalary: z.number().int(),
  adjustmentPercent: z.number().optional(),
  reason: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const entries = await db.query.compensationReviewEntry.findMany({
      where: eq(compensationReviewEntry.reviewId, id),
      with: { employee: true },
    });

    return ok({ data: entries });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [entry] = await db
      .insert(compensationReviewEntry)
      .values({ reviewId: id, ...parsed })
      .returning();

    return created({ entry });
  } catch (err) {
    return handleError(err);
  }
}
