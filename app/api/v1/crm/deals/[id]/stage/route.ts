import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { CRM_PERMISSION, moveDealToStage } from "@/lib/api/crm-deals";
import { z } from "zod";

const schema = z.object({
  stageId: z.string().min(1),
  // Only used when stageId is the Lost stage.
  reason: z.string().nullable().optional(),
});

/**
 * Move a deal to a stage. Moving to the Won or Lost stage closes the deal
 * (same as /won and /lost); moving a closed deal to an open stage reopens it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, CRM_PERMISSION);
    const body = await request.json();
    const { stageId, reason } = schema.parse(body);

    const { before, deal: updated } = await moveDealToStage(ctx, id, stageId, { reason });

    logAudit({ ctx, action: "change_stage", entityType: "deal", entityId: id, changes: { previousStatus: before.stageId, stageId }, request });

    return ok({ deal: updated });
  } catch (err) {
    return handleError(err);
  }
}
