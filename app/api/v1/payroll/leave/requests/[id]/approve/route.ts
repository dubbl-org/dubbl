import { db } from "@/lib/db";
import { leaveRequest, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { syncLeaveBalances } from "@/lib/api/leave-balances";

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

    const req = await db.query.leaveRequest.findFirst({
      where: and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.organizationId, ctx.organizationId)
      ),
    });

    if (!req) return notFound("Leave request");
    if (req.status !== "pending") return validationError("Only pending requests can be approved");

    const [updated] = await db
      .update(leaveRequest)
      .set({
        status: "approved",
        approvedBy: memberRecord.id,
        approvedAt: new Date(),
      })
      .where(and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.organizationId, ctx.organizationId)
      ))
      .returning();

    // Recalculate the employee's balances for the year the leave falls in.
    await syncLeaveBalances(ctx.organizationId, {
      employeeIds: [req.employeeId],
      year: Number(req.startDate.slice(0, 4)),
    });

    logAudit({ ctx, action: "approve", entityType: "leaveRequest", entityId: id, request });

    return ok({ request: updated });
  } catch (err) {
    return handleError(err);
  }
}
