import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { emailRunPayslips } from "@/lib/api/payslips";

/** Email every not-yet-sent payslip in the run to its employee, PDF attached. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const result = await emailRunPayslips(ctx, id);

    logAudit({ ctx, action: "email_payslips", entityType: "payrollRun", entityId: id, changes: result, request });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
