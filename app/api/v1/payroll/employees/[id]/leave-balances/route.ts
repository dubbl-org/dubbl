import { db } from "@/lib/db";
import { employeeLeaveBalance, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { syncLeaveBalances } from "@/lib/api/leave-balances";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    if (!emp) return notFound("Employee");

    // Bring this year's balances up to date (accrual, approved leave).
    await syncLeaveBalances(ctx.organizationId, { employeeIds: [id] });

    const year = new Date().getFullYear();
    const balances = await db.query.employeeLeaveBalance.findMany({
      where: and(eq(employeeLeaveBalance.employeeId, id), eq(employeeLeaveBalance.year, year)),
      with: { policy: true },
    });

    return ok({ data: balances.filter((b) => b.policy?.isActive && !b.policy.deletedAt) });
  } catch (err) {
    return handleError(err);
  }
}
