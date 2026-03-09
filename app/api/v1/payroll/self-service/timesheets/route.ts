import { db } from "@/lib/db";
import { timesheet, payrollEmployee, member } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

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

    const timesheets = await db.query.timesheet.findMany({
      where: and(
        eq(timesheet.employeeId, emp.id),
        notDeleted(timesheet.deletedAt)
      ),
      orderBy: desc(timesheet.createdAt),
      with: { entries: true },
    });

    return ok({ data: timesheets });
  } catch (err) {
    return handleError(err);
  }
}

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

    const [ts] = await db
      .insert(timesheet)
      .values({
        organizationId: ctx.organizationId,
        employeeId: emp.id,
        ...parsed,
      })
      .returning();

    return created({ timesheet: ts });
  } catch (err) {
    return handleError(err);
  }
}
