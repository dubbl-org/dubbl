import { db } from "@/lib/db";
import { employeeLeaveBalance, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

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

    const balances = await db.query.employeeLeaveBalance.findMany({
      where: eq(employeeLeaveBalance.employeeId, id),
      with: { policy: true },
    });

    return ok({ data: balances });
  } catch (err) {
    return handleError(err);
  }
}
