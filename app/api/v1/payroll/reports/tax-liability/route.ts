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

    const taxByEmployee = await db
      .select({
        employeeId: payrollItem.employeeId,
        employeeName: payrollEmployee.name,
        totalTax: sql<number>`coalesce(sum(${payrollItem.taxAmount}), 0)`.mapWith(Number),
        totalGross: sql<number>`coalesce(sum(${payrollItem.grossAmount}), 0)`.mapWith(Number),
      })
      .from(payrollItem)
      .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
      .innerJoin(payrollEmployee, eq(payrollItem.employeeId, payrollEmployee.id))
      .where(and(...conditions))
      .groupBy(payrollItem.employeeId, payrollEmployee.name);

    const totalTax = taxByEmployee.reduce((sum, e) => sum + e.totalTax, 0);

    return ok({ data: taxByEmployee, totalTax });
  } catch (err) {
    return handleError(err);
  }
}
