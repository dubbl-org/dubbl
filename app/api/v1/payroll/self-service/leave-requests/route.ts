import { db } from "@/lib/db";
import { leaveRequest, payrollEmployee, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  policyId: z.string().uuid(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  hours: z.number().min(0),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
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

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [req] = await db
      .insert(leaveRequest)
      .values({
        organizationId: ctx.organizationId,
        employeeId: emp.id,
        ...parsed,
      })
      .returning();

    return created({ request: req });
  } catch (err) {
    return handleError(err);
  }
}
