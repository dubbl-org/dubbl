import { db } from "@/lib/db";
import { payslip, payrollRun } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payslips");

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
