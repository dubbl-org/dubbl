import { db } from "@/lib/db";
import { employeeDeduction, payrollEmployee, deductionType } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  deductionTypeId: z.string().uuid(),
  timing: z.enum(["recurring", "one_time"]).optional(),
  amount: z.number().int().min(0).optional(),
  percent: z.number().min(0).max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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

    const deductions = await db.query.employeeDeduction.findMany({
      where: and(
        eq(employeeDeduction.employeeId, id),
        notDeleted(employeeDeduction.deletedAt)
      ),
      with: { deductionType: true },
    });

    return ok({ data: deductions });
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

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
      columns: { id: true },
    });
    if (!emp) return notFound("Employee");
    const type = await db.query.deductionType.findFirst({
      where: and(
        eq(deductionType.id, parsed.deductionTypeId),
        eq(deductionType.organizationId, ctx.organizationId),
        notDeleted(deductionType.deletedAt)
      ),
      columns: { id: true },
    });
    if (!type) return notFound("Deduction type");
    if (parsed.amount != null && parsed.percent != null) {
      return validationError("Use either a fixed amount or a percentage, not both");
    }

    const [ded] = await db
      .insert(employeeDeduction)
      .values({ employeeId: id, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "employeeDeduction", entityId: ded.id, request });

    return created({ deduction: ded });
  } catch (err) {
    return handleError(err);
  }
}
