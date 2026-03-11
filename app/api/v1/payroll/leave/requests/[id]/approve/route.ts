import { db } from "@/lib/db";
import { leaveRequest, employeeLeaveBalance, member } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
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

    const req = await db.query.leaveRequest.findFirst({
      where: eq(leaveRequest.id, id),
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
      .where(eq(leaveRequest.id, id))
      .returning();

    // Update leave balance
    const year = new Date().getFullYear();
    await db
      .update(employeeLeaveBalance)
      .set({
        usedHours: sql`${employeeLeaveBalance.usedHours} + ${req.hours}`,
        balance: sql`${employeeLeaveBalance.balance} - ${req.hours}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(employeeLeaveBalance.employeeId, req.employeeId),
        eq(employeeLeaveBalance.policyId, req.policyId),
        eq(employeeLeaveBalance.year, year)
      ));

    logAudit({ ctx, action: "approve", entityType: "leaveRequest", entityId: id, request });

    return ok({ request: updated });
  } catch (err) {
    return handleError(err);
  }
}
