import { db } from "@/lib/db";
import { payrollRun, payrollItem, payrollEmployee } from "@/lib/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const conditions = [
      eq(payrollRun.organizationId, ctx.organizationId),
      eq(payrollRun.status, "completed"),
      notDeleted(payrollRun.deletedAt),
    ];

    if (startDate) conditions.push(gte(payrollRun.payPeriodStart, startDate));
    if (endDate) conditions.push(lte(payrollRun.payPeriodEnd, endDate));

    const costByDept = await db
      .select({
        department: sql<string>`coalesce(${payrollEmployee.department}, 'Unassigned')`,
        totalGross: sql<number>`coalesce(sum(${payrollItem.grossAmount}), 0)`.mapWith(Number),
        totalNet: sql<number>`coalesce(sum(${payrollItem.netAmount}), 0)`.mapWith(Number),
        employeeCount: sql<number>`count(distinct ${payrollItem.employeeId})`.mapWith(Number),
      })
      .from(payrollItem)
      .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
      .innerJoin(payrollEmployee, eq(payrollItem.employeeId, payrollEmployee.id))
      .where(and(...conditions))
      .groupBy(payrollEmployee.department);

    return ok({ data: costByDept });
  } catch (err) {
    return handleError(err);
  }
}
