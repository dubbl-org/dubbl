import { db } from "@/lib/db";
import { payrollRun, approvalRecord, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const memberRecord = await db.query.member.findFirst({
      where: and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });
    if (!memberRecord) return notFound("Member");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });

    if (!run) return notFound("Payroll run");
    if (run.status !== "pending_approval") return validationError("Run is not pending approval");

    // Update the approval record for this approver
    const [record] = await db
      .update(approvalRecord)
      .set({ status: "approved", decidedAt: new Date() })
      .where(and(
        eq(approvalRecord.payrollRunId, id),
        eq(approvalRecord.approverId, memberRecord.id),
        eq(approvalRecord.status, "pending")
      ))
      .returning();

    if (!record) return validationError("No pending approval found for your account");

    // Check if all approvals are done
    const pendingRecords = await db.query.approvalRecord.findMany({
      where: and(
        eq(approvalRecord.payrollRunId, id),
        eq(approvalRecord.status, "pending")
      ),
    });

    if (pendingRecords.length === 0) {
      // All approved - move to draft for processing
      await db
        .update(payrollRun)
        .set({
          status: "draft",
          approvalStatus: "approved",
          approvedBy: memberRecord.id,
          approvedAt: new Date(),
        })
        .where(eq(payrollRun.id, id));
    }

    logAudit({ ctx, action: "approve", entityType: "payrollRun", entityId: id, request });

    const updated = await db.query.payrollRun.findFirst({
      where: eq(payrollRun.id, id),
    });

    return ok({ run: updated });
  } catch (err) {
    return handleError(err);
  }
}
