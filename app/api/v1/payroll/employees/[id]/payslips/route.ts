import { db } from "@/lib/db";
import { payslip, payrollRun, payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payslips");

    // Verify the employee belongs to the caller's org before listing payslips.
    const employee = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId)
      ),
    });
    if (!employee) return notFound("Employee");

    const payslips = await db.query.payslip.findMany({
      where: eq(payslip.employeeId, id),
      orderBy: desc(payslip.generatedAt),
      with: { payrollRun: true },
    });

    return ok({ data: payslips });
  } catch (err) {
    return handleError(err);
  }
}
