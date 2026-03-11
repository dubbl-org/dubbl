import { db } from "@/lib/db";
import { employeeSchedule, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  shiftId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    if (!emp) return notFound("Employee");

    const schedules = await db.query.employeeSchedule.findMany({
      where: eq(employeeSchedule.employeeId, id),
      with: { shift: true },
    });

    return ok({ data: schedules });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [schedule] = await db
      .insert(employeeSchedule)
      .values({ employeeId: id, ...parsed })
      .returning();

    return created({ schedule });
  } catch (err) {
    return handleError(err);
  }
}
