import { db } from "@/lib/db";
import { payrollRun, payrollEmployee } from "@/lib/db/schema";
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
    const year = parseInt(url.searchParams.get("year") || new Date().getFullYear().toString());

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Get actual spend
    const [actual] = await db
      .select({
        totalGross: sql<number>`coalesce(sum(${payrollRun.totalGross}), 0)`.mapWith(Number),
        totalNet: sql<number>`coalesce(sum(${payrollRun.totalNet}), 0)`.mapWith(Number),
      })
      .from(payrollRun)
      .where(and(
        eq(payrollRun.organizationId, ctx.organizationId),
        eq(payrollRun.status, "completed"),
        notDeleted(payrollRun.deletedAt),
        gte(payrollRun.payPeriodStart, startDate),
        lte(payrollRun.payPeriodEnd, endDate)
      ));

    // Budget = annual salaries of active employees
    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.isActive, true),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    const annualBudget = employees.reduce((sum, emp) => sum + emp.salary, 0);

    return ok({
      year,
      budget: annualBudget,
      actual: actual?.totalGross || 0,
      variance: annualBudget - (actual?.totalGross || 0),
      utilizationPercent: annualBudget > 0
        ? Math.round(((actual?.totalGross || 0) / annualBudget) * 10000) / 100
        : 0,
    });
  } catch (err) {
    return handleError(err);
  }
}
