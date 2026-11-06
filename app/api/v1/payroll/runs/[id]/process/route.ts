import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { processPayrollRun } from "@/lib/api/payroll-run-actions";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const processSchema = z.object({
  accrued: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json().catch(() => ({}));
    const parsed = processSchema.parse(body ?? {});

    // Posts ONE balanced journal entry (gross wages DR; each withholding CR to
    // its proper liability, take-home pay CR to bank) and completes the run,
    // atomically. Refuses runs that still need sign-off or fall in a locked
    // period. See lib/api/payroll-run-actions.ts.
    const run = await processPayrollRun(ctx, id, { accrued: parsed.accrued });

    logAudit({
      ctx,
      action: "process_payroll_run",
      entityType: "payrollRun",
      entityId: id,
      request,
    });

    return NextResponse.json({ run });
  } catch (err) {
    return handleError(err);
  }
}
