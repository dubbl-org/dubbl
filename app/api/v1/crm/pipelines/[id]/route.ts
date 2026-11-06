import { db } from "@/lib/db";
import { pipeline } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  CRM_PERMISSION,
  applyPipelineStages,
  clearOtherDefaults,
  deletePipelineMovingDeals,
} from "@/lib/api/crm-deals";
import { ok, notFound, handleError, validationError } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const p = await db.query.pipeline.findFirst({
      where: and(
        eq(pipeline.id, id),
        eq(pipeline.organizationId, ctx.organizationId),
        notDeleted(pipeline.deletedAt)
      ),
      with: { deals: { where: (d, { isNull }) => isNull(d.deletedAt) } },
    });

    if (!p) return notFound("Pipeline");
    return ok({ pipeline: p });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stages: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, CRM_PERMISSION);

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.pipeline.findFirst({
      where: and(eq(pipeline.id, id), eq(pipeline.organizationId, ctx.organizationId), notDeleted(pipeline.deletedAt)),
    });
    if (!existing) return notFound("Pipeline");
    if (parsed.isDefault === false && existing.isDefault) {
      return validationError("Set another pipeline as the default instead");
    }

    const updated = await db.transaction(async (tx) => {
      const changes: Partial<typeof pipeline.$inferInsert> = {};
      if (parsed.name !== undefined) changes.name = parsed.name;
      if (parsed.isDefault !== undefined) changes.isDefault = parsed.isDefault;
      if (parsed.stages !== undefined) {
        // Keeps Won and Lost; deals in a removed stage move to the first stage.
        changes.stages = (await applyPipelineStages(tx, ctx.organizationId, id, parsed.stages)).stages;
      }
      const [row] = await tx
        .update(pipeline)
        .set(changes)
        .where(and(eq(pipeline.id, id), eq(pipeline.organizationId, ctx.organizationId)))
        .returning();
      if (row?.isDefault) await clearOtherDefaults(tx, ctx.organizationId, id);
      return row;
    });

    if (!updated) return notFound("Pipeline");

    logAudit({ ctx, action: "update", entityType: "pipeline", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return ok({ pipeline: updated });
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
    requireRole(ctx, CRM_PERMISSION);

    // Its deals move to the default pipeline (or the next one) so none are hidden.
    const { pipeline: deleted, movedDeals, movedTo } = await deletePipelineMovingDeals(ctx, id);

    logAudit({
      ctx,
      action: "delete",
      entityType: "pipeline",
      entityId: id,
      changes: { ...(deleted as Record<string, unknown>), movedDeals, movedTo: movedTo?.id ?? null },
      request,
    });

    return ok({ success: true, movedDeals, movedTo });
  } catch (err) {
    return handleError(err);
  }
}
