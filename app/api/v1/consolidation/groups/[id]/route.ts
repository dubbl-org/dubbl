import { db } from "@/lib/db";
import { consolidationGroup } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const group = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
      with: {
        members: {
          with: { organization: true },
        },
      },
    });

    if (!group) return notFound("Consolidation group");
    return ok({ group });
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

    const existing = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
    });

    if (!existing) return notFound("Consolidation group");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(consolidationGroup)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(consolidationGroup.id, id))
      .returning();

    return ok({ group: updated });
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

    const existing = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
    });

    if (!existing) return notFound("Consolidation group");

    await db
      .update(consolidationGroup)
      .set(softDelete())
      .where(eq(consolidationGroup.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "consolidation_group",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
