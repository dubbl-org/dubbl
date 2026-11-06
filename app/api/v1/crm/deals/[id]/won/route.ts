import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { CRM_PERMISSION, moveDealToStage } from "@/lib/api/crm-deals";
import { WON_STAGE } from "@/lib/crm/rules";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, CRM_PERMISSION);

    const { before, deal: updated } = await moveDealToStage(ctx, id, WON_STAGE);

    logAudit({ ctx, action: "won", entityType: "deal", entityId: id, changes: { previousStatus: before.stageId }, request });

    return ok({ deal: updated });
  } catch (err) {
    return handleError(err);
  }
}
