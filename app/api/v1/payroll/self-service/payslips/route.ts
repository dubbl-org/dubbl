import { db } from "@/lib/db";
import { payslip, payrollEmployee, member } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "self-service:payroll");

    const memberRecord = await db.query.member.findFirst({
      where: and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });
    if (!memberRecord) return notFound("Member");

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.memberId, memberRecord.id),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    if (!emp) return notFound("Employee profile");

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
