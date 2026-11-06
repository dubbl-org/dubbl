import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createBonusOnlyRun } from "@/lib/api/payroll-offcycle";

/**
 * Pay one or more bonuses outside the regular run. Each employee's bonuses are
 * added up and taxed together through the same withholding engine as a
 * regular run (income tax + FICA against their YTD wages, plus employer
 * taxes). The run is finished and posted straight away, unless payroll runs
 * need sign-off, in which case it is left as a draft to send for sign-off.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await createBonusOnlyRun(ctx, await request.json());

    logAudit({ ctx, action: "create_bonus_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
