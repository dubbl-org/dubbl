import { db } from "@/lib/db";
import { payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const whatIfSchema = z.object({
  salaryAdjustmentPercent: z.number().optional(),
  newHires: z.number().int().optional(),
  avgNewHireSalary: z.number().int().optional(),
  terminations: z.number().int().optional(),
  months: z.number().int().min(1).max(60).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const body = await request.json();
    const parsed = whatIfSchema.parse(body);
    const months = parsed.months || 12;

    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.isActive, true),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    // Current state
    const currentMonthlyGross = employees.reduce((sum, emp) => {
      return sum + Math.round(emp.salary / 12);
    }, 0);

    // Projected state
    const adjustmentMultiplier = 1 + ((parsed.salaryAdjustmentPercent || 0) / 100);
    let projectedMonthlyGross = Math.round(currentMonthlyGross * adjustmentMultiplier);

    // Add new hires
    if (parsed.newHires && parsed.avgNewHireSalary) {
      projectedMonthlyGross += Math.round((parsed.avgNewHireSalary / 12) * parsed.newHires);
    }

    // Remove terminations (avg salary)
    if (parsed.terminations && employees.length > 0) {
      const avgSalary = employees.reduce((sum, emp) => sum + emp.salary, 0) / employees.length;
      projectedMonthlyGross -= Math.round((avgSalary / 12) * parsed.terminations);
    }

    const currentProjected = currentMonthlyGross * months;
    const newProjected = projectedMonthlyGross * months;

    return ok({
      current: {
        monthlyGross: currentMonthlyGross,
        projectedTotal: currentProjected,
        headcount: employees.length,
      },
      projected: {
        monthlyGross: projectedMonthlyGross,
        projectedTotal: newProjected,
        headcount: employees.length + (parsed.newHires || 0) - (parsed.terminations || 0),
      },
      difference: {
        monthlyGross: projectedMonthlyGross - currentMonthlyGross,
        projectedTotal: newProjected - currentProjected,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
