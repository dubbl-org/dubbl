import { db } from "@/lib/db";
import { payrollRun, approvalChain, approvalRecord, approvalChainStep } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
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
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });

    if (!run) return notFound("Payroll run");
    if (run.status !== "draft") return validationError("Only draft runs can be submitted for approval");

    // Find active approval chain
    const chain = await db.query.approvalChain.findFirst({
      where: and(
        eq(approvalChain.organizationId, ctx.organizationId),
        eq(approvalChain.isActive, true),
        notDeleted(approvalChain.deletedAt)
      ),
      with: { steps: true },
    });

    if (!chain || chain.steps.length === 0) {
      return validationError("No active approval chain configured");
    }

    // Create approval records for each step
    const sortedSteps = chain.steps.sort((a, b) => a.stepOrder - b.stepOrder);

    await db.insert(approvalRecord).values(
      sortedSteps.map((step) => ({
        payrollRunId: id,
        stepId: step.id,
        approverId: step.approverId,
        status: "pending" as const,
      }))
    );

    const [updated] = await db
      .update(payrollRun)
      .set({ status: "pending_approval", approvalStatus: "pending" })
      .where(eq(payrollRun.id, id))
      .returning();

    logAudit({ ctx, action: "submit_for_approval", entityType: "payrollRun", entityId: id, request });

    return ok({ run: updated });
  } catch (err) {
    return handleError(err);
  }
}
