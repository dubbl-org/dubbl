import { db } from "@/lib/db";
import { payrollRun, approvalRecord, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

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

    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body);

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });

    if (!run) return notFound("Payroll run");
    if (run.status !== "pending_approval") return validationError("Run is not pending approval");

    // Update the approval record
    await db
      .update(approvalRecord)
      .set({ status: "rejected", comment: parsed.reason || null, decidedAt: new Date() })
      .where(and(
        eq(approvalRecord.payrollRunId, id),
        eq(approvalRecord.approverId, memberRecord.id),
        eq(approvalRecord.status, "pending")
      ));

    // Move run back to draft with rejected status
    const [updated] = await db
      .update(payrollRun)
      .set({ status: "draft", approvalStatus: "rejected" })
      .where(eq(payrollRun.id, id))
      .returning();

    logAudit({ ctx, action: "reject", entityType: "payrollRun", entityId: id, request });

    return ok({ run: updated });
  } catch (err) {
    return handleError(err);
  }
}
