import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { generateRunPayslips } from "@/lib/api/payslips";

/**
 * Create payslips for a finished run. Only pay items without a payslip get
 * one, so calling this again never makes duplicates.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const result = await generateRunPayslips(ctx.organizationId, id);

    logAudit({ ctx, action: "generate_payslips", entityType: "payrollRun", entityId: id, changes: result, request });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
