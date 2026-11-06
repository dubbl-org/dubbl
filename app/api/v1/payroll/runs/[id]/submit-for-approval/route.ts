import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { submitRunForApproval } from "@/lib/api/payroll-run-actions";


/** Send a draft run for sign-off by the active approval chain's approvers. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await submitRunForApproval(ctx, id);

    logAudit({ ctx, action: "submit_for_approval", entityType: "payrollRun", entityId: id, request });

    return ok({ run });
  } catch (err) {
    return handleError(err);
  }
}
