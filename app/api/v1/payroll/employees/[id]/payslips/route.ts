import { db } from "@/lib/db";
import { payslip, payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
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
      columns: { id: true },
    });
    if (!emp) return notFound("Employee");

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
