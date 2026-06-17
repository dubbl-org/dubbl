import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  payrollRun,
  approvalChain,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { postPayrollRun } from "@/lib/api/payroll-posting";
import { logAudit } from "@/lib/api/audit";

export async function POST(
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
          with: { employee: true },
        },
      },
    });

    if (!run) return notFound("Payroll run");

    const isApprovedPendingRun =
      run.status === "pending_approval" && run.approvalStatus === "approved";

    if (run.status !== "draft" && !isApprovedPendingRun) {
      return NextResponse.json(
        { error: "Only draft payroll runs can be processed" },
        { status: 400 }
      );
    }

    // Check if an approval chain is configured for this org
    const chains = await db.query.approvalChain.findMany({
      where: and(
        eq(approvalChain.organizationId, ctx.organizationId),
        notDeleted(approvalChain.deletedAt)
      ),
    });

    if (chains.length > 0 && run.approvalStatus !== "approved") {
      return NextResponse.json(
        { error: "This run requires approval before processing" },
        { status: 400 }
      );
    }

    // Post ONE balanced journal entry (gross wages DR; each withholding CR to
    // its proper liability — income tax 2220, FICA/NIC 2235, pension/benefits
    // 2245, etc. — net pay CR to bank) and complete the run, atomically. The
    // posting helper drives the withholding split from the per-item tax/
    // deduction breakdowns and stamps payrollRun.journalEntryId.
    const updated = await db.transaction(async (tx) => {
      const journalEntryId = await postPayrollRun(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        run.id,
        tx
      );

      const [row] = await tx
        .update(payrollRun)
        .set({
          status: "completed",
          processedAt: new Date(),
        })
        .where(eq(payrollRun.id, id))
        .returning();

      return { ...row, journalEntryId };
    });

    logAudit({
      ctx,
      action: "process_payroll_run",
      entityType: "payrollRun",
      entityId: run.id,
      request,
    });

    return NextResponse.json({ run: { ...updated, items: run.items } });
  } catch (err) {
    return handleError(err);
  }
}
