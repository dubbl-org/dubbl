import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { CRM_PERMISSION, moveDealToStage } from "@/lib/api/crm-deals";
import { LOST_STAGE } from "@/lib/crm/rules";
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
    requireRole(ctx, CRM_PERMISSION);
    const body = await request.json().catch(() => ({}));
    const { reason } = schema.parse(body ?? {});

    const { before, deal: updated } = await moveDealToStage(ctx, id, LOST_STAGE, { reason });

    logAudit({ ctx, action: "lost", entityType: "deal", entityId: id, changes: { previousStatus: before.stageId, lostReason: updated.lostReason }, request });

    return ok({ deal: updated });
  } catch (err) {
    return handleError(err);
  }
}
