import { db } from "@/lib/db";
import { employeeLeaveBalance, payrollEmployee, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { syncLeaveBalances } from "@/lib/api/leave-balances";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "self-service:payroll");

    const memberRecord = await db.query.member.findFirst({
      where: and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });
    if (!memberRecord) return notFound("Member");

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.memberId, memberRecord.id),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    if (!emp) return notFound("Employee profile");

    // Bring this year's balances up to date (accrual, approved leave).
    await syncLeaveBalances(ctx.organizationId, { employeeIds: [emp.id] });

    const year = new Date().getFullYear();
    const balances = await db.query.employeeLeaveBalance.findMany({
      where: and(eq(employeeLeaveBalance.employeeId, emp.id), eq(employeeLeaveBalance.year, year)),
      with: { policy: true },
    });

    return ok({ data: balances.filter((b) => b.policy?.isActive && !b.policy.deletedAt) });
  } catch (err) {
    return handleError(err);
  }
}
