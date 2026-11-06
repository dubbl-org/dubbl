import { db } from "@/lib/db";
import { member, payslip, payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { hasPermission } from "@/lib/plans";
import { handleError, notFound, ok } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payslips");

    // The employee must belong to this workspace before any payslips are returned.
    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
      columns: { id: true, memberId: true },
    });
    if (!emp) return notFound("Employee");

    // Pay is private: without manage:payroll you only see your own payslips.
    if (!hasPermission(ctx.permissions ?? ctx.role, "manage:payroll")) {
      const me = await db.query.member.findFirst({
        where: and(eq(member.userId, ctx.userId), eq(member.organizationId, ctx.organizationId)),
        columns: { id: true },
      });
      if (!me || emp.memberId !== me.id) return notFound("Employee");
    }

    const payslips = await db.query.payslip.findMany({
      where: eq(payslip.employeeId, emp.id),
      orderBy: desc(payslip.generatedAt),
      with: { payrollRun: true },
    });

    return ok({ data: payslips });
  } catch (err) {
    return handleError(err);
  }
}
