import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollRun } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { voidPayrollRun, deleteDraftPayrollRun } from "@/lib/api/payroll-run-actions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
      with: {
        items: {
          with: {
            employee: true,
            taxBreakdowns: true,
            employerTaxBreakdowns: true,
            deductionBreakdowns: { with: { deductionType: { columns: { name: true } } } },
          },
        },
        // Sign-off history (who approved or sent it back, and why).
        approvalRecords: {
          columns: { id: true, status: true, comment: true, decidedAt: true },
          with: { approver: { columns: { id: true }, with: { user: { columns: { name: true, email: true } } } } },
        },
        journalEntry: { columns: { id: true, entryNumber: true, voidedAt: true, voidReason: true } },
      },
    });

    if (!run) return notFound("Payroll run");
    return NextResponse.json({ run });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Delete an unfinished run, or void a finished one. Voiding posts a reversing
 * journal entry so the books net back to zero; pass an optional ?reason=.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });

    if (!run) return notFound("Payroll run");

    if (run.status === "completed") {
      const reason = new URL(request.url).searchParams.get("reason");
      const result = await voidPayrollRun(ctx, id, reason);

      logAudit({
        ctx,
        action: "void",
        entityType: "payroll_run",
        entityId: id,
        changes: { reversalEntryId: result.reversalEntryId, reason },
        request,
      });

      return NextResponse.json({ success: true, voided: true, ...result });
    }
    if (run.status === "void") {
      return validationError("This payroll run is already void");
    }

    await deleteDraftPayrollRun(ctx, id);

    logAudit({
      ctx,
      action: "delete",
      entityType: "payroll_run",
      entityId: id,
      changes: run as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
