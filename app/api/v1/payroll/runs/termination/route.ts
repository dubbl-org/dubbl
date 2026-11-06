import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createFinalPayRun } from "@/lib/api/payroll-offcycle";

/**
 * Final pay for someone leaving: pay for the days worked in the final period
 * (salary at a daily rate, or hourly from approved timesheets, else 8 hours a
 * weekday), plus optionally their unused vacation/personal leave paid out. The
 * whole amount is one pay item, taxed and with deductions like a regular run.
 * The employee is marked inactive with the period end as their last day.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await createFinalPayRun(ctx, await request.json());

    logAudit({ ctx, action: "create_termination_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
