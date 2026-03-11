import { db } from "@/lib/db";
import { assemblyOrder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["draft", "in_progress", "completed", "cancelled"]).optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(assemblyOrder)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(assemblyOrder.id, id),
          eq(assemblyOrder.organizationId, ctx.organizationId),
          notDeleted(assemblyOrder.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Assembly order");
    return ok({ order: updated });
  } catch (err) {
    return handleError(err);
  }
}
