import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createCorrectionRun } from "@/lib/api/payroll-offcycle";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await createCorrectionRun(ctx, await request.json());

    logAudit({ ctx, action: "create_correction_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
