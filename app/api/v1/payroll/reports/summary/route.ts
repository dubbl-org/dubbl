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

    const [summary] = await db
      .select({
        totalRuns: sql<number>`count(*)`.mapWith(Number),
        totalGross: sql<number>`coalesce(sum(${payrollRun.totalGross}), 0)`.mapWith(Number),
        totalDeductions: sql<number>`coalesce(sum(${payrollRun.totalDeductions}), 0)`.mapWith(Number),
        totalNet: sql<number>`coalesce(sum(${payrollRun.totalNet}), 0)`.mapWith(Number),
      })
      .from(payrollRun)
      .where(and(...conditions));

    const [empCount] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(payrollEmployee)
      .where(and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.isActive, true),
        notDeleted(payrollEmployee.deletedAt)
      ));

    return ok({
      summary: {
        ...summary,
        activeEmployees: empCount?.count || 0,
        avgCostPerRun: summary && summary.totalRuns > 0
          ? Math.round(summary.totalGross / summary.totalRuns)
          : 0,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
