import { db } from "@/lib/db";
import { assemblyOrder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const orders = await db.query.assemblyOrder.findMany({
      where: and(
        eq(assemblyOrder.organizationId, ctx.organizationId),
        notDeleted(assemblyOrder.deletedAt)
      ),
      with: { bom: { with: { assemblyItem: true } } },
      orderBy: assemblyOrder.createdAt,
    });

    return ok({ data: orders });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  bomId: z.string().uuid(),
  quantity: z.number().int().min(1),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [order] = await db
      .insert(assemblyOrder)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return created({ order });
  } catch (err) {
    return handleError(err);
  }
}
