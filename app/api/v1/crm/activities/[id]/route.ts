import { db } from "@/lib/db";
import { deal, dealActivity } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";

/** The activity, but only when its deal belongs to this workspace. */
async function findActivity(id: string, organizationId: string) {
  const [row] = await db
    .select({ activity: dealActivity })
    .from(dealActivity)
    .innerJoin(deal, eq(deal.id, dealActivity.dealId))
    .where(and(eq(dealActivity.id, id), eq(deal.organizationId, organizationId), notDeleted(deal.deletedAt)))
    .limit(1);
  return row?.activity ?? null;
}

const patchSchema = z.object({
  completed: z.boolean().optional(),
  content: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const parsed = patchSchema.parse(await request.json());

    const existing = await findActivity(id, ctx.organizationId);
    if (!existing) return notFound("Activity");

    const updates: Partial<typeof dealActivity.$inferInsert> = {};
    if (parsed.completed !== undefined) updates.completedAt = parsed.completed ? new Date() : null;
    if (parsed.content !== undefined) updates.content = parsed.content;
    if (parsed.scheduledAt !== undefined) updates.scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt) : null;

    const [activity] = await db.update(dealActivity).set(updates).where(eq(dealActivity.id, id)).returning();

    logAudit({ ctx, action: "update", entityType: "deal_activity", entityId: id, changes: updates as Record<string, unknown>, request });

    return ok({ activity });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const existing = await findActivity(id, ctx.organizationId);
    if (!existing) return notFound("Activity");

    await db.delete(dealActivity).where(eq(dealActivity.id, id));

    logAudit({ ctx, action: "delete", entityType: "deal_activity", entityId: id, changes: existing as Record<string, unknown>, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
