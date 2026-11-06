import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { removeBonusFromRun } from "@/lib/api/payroll-run-actions";

/** Remove a bonus from an unfinished run and recalculate that employee's pay. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; bonusId: string }> }
) {
  try {
    const { id, bonusId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const result = await removeBonusFromRun(ctx, id, bonusId);

    logAudit({ ctx, action: "delete", entityType: "payrollBonus", entityId: bonusId, request });

    return ok({ success: true, run: result.run });
  } catch (err) {
    return handleError(err);
  }
}
