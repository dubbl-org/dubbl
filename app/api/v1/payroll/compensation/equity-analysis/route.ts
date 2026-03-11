import { db } from "@/lib/db";
import { payrollEmployee, compensationBand } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.isActive, true),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    const bands = await db.query.compensationBand.findMany({
      where: and(
        eq(compensationBand.organizationId, ctx.organizationId),
        notDeleted(compensationBand.deletedAt)
      ),
    });

    const bandMap = new Map(bands.map((b) => [b.id, b]));

    const analysis = employees.map((emp) => {
      const band = emp.compensationBandId ? bandMap.get(emp.compensationBandId) : null;
      let rangePenetration: number | null = null;

      if (band && band.maxSalary > band.minSalary) {
        rangePenetration = ((emp.salary - band.minSalary) / (band.maxSalary - band.minSalary)) * 100;
      }

      return {
        employeeId: emp.id,
        name: emp.name,
        salary: emp.salary,
        bandId: emp.compensationBandId,
        bandName: band?.name || null,
        rangePenetration,
        belowMin: band ? emp.salary < band.minSalary : null,
        aboveMax: band ? emp.salary > band.maxSalary : null,
      };
    });

    return ok({ data: analysis });
  } catch (err) {
    return handleError(err);
  }
}
