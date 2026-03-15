import { db } from "@/lib/db";
import { deal } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const schema = z.object({
  reason: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const { reason } = schema.parse(body);

    const found = await db.query.deal.findFirst({
      where: and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)),
    });
    if (!found) return notFound("Deal");

    const [updated] = await db
      .update(deal)
      .set({
        stageId: "closed_lost",
        lostAt: new Date(),
        lostReason: reason || null,
        probability: 0,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deal.id, id),
          eq(deal.organizationId, ctx.organizationId),
          notDeleted(deal.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Deal");

    logAudit({ ctx, action: "lost", entityType: "deal", entityId: id, changes: { previousStatus: found.stageId }, request });

    return ok({ deal: updated });
  } catch (err) {
    return handleError(err);
  }
}
