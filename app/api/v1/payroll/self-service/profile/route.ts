import { db } from "@/lib/db";
import { payrollEmployee, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  bankAccountNumber: z.string().optional(),
  email: z.string().email().optional(),
});

async function getEmployeeForMember({ organizationId, memberId }: { organizationId: string; memberId: string }) {
  return db.query.payrollEmployee.findFirst({
    where: and(
      eq(payrollEmployee.organizationId, organizationId),
      eq(payrollEmployee.memberId, memberId),
      notDeleted(payrollEmployee.deletedAt)
    ),
  });
}

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

    const emp = await getEmployeeForMember({ organizationId: ctx.organizationId, memberId: memberRecord.id });
    if (!emp) return notFound("Employee profile");

    return ok({ employee: emp });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request) {
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

    const emp = await getEmployeeForMember({ organizationId: ctx.organizationId, memberId: memberRecord.id });
    if (!emp) return notFound("Employee profile");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(payrollEmployee)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(payrollEmployee.id, emp.id))
      .returning();

    return ok({ employee: updated });
  } catch (err) {
    return handleError(err);
  }
}
