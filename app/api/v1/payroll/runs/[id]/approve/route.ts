import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { approveRun } from "@/lib/api/payroll-run-actions";


/** Approve your step; the last approval marks the run signed off. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const run = await approveRun(ctx, id);

    logAudit({ ctx, action: "approve", entityType: "payrollRun", entityId: id, request });

    return ok({ run });
  } catch (err) {
    return handleError(err);
  }
}
