import { db } from "@/lib/db";
import { payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const url = new URL(request.url);
    const months = parseInt(url.searchParams.get("months") || "12");

    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.isActive, true),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    const monthlyGross = employees.reduce((sum, emp) => {
      if (emp.compensationType === "salary") {
        return sum + Math.round(emp.salary / 12);
      }
      if (emp.compensationType === "hourly" && emp.hourlyRate) {
        return sum + Math.round(emp.hourlyRate * 173);
      }
      return sum;
    }, 0);

    const avgTaxRate = employees.length > 0
      ? employees.reduce((sum, emp) => sum + emp.taxRate, 0) / employees.length
      : 2000;

    const monthlyTax = Math.round((monthlyGross * avgTaxRate) / 10000);
    const monthlyNet = monthlyGross - monthlyTax;

    const projection = Array.from({ length: months }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() + i + 1);
      return {
        month: date.toISOString().slice(0, 7),
        gross: monthlyGross,
        tax: monthlyTax,
        net: monthlyNet,
        headcount: employees.length,
      };
    });

    return ok({
      data: projection,
      totals: {
        gross: monthlyGross * months,
        tax: monthlyTax * months,
        net: monthlyNet * months,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
