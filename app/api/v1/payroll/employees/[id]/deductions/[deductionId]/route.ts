import { db } from "@/lib/db";
import { employeeDeduction } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  timing: z.enum(["recurring", "one_time"]).optional(),
  amount: z.number().int().nullable().optional(),
  percent: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  try {
    const { deductionId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(employeeDeduction)
      .set(parsed)
      .where(eq(employeeDeduction.id, deductionId))
      .returning();

    if (!updated) return notFound("Deduction");

    logAudit({ ctx, action: "update", entityType: "employeeDeduction", entityId: deductionId, changes: parsed, request });

    return ok({ deduction: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  try {
    const { deductionId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const [deleted] = await db
      .update(employeeDeduction)
      .set(softDelete())
      .where(eq(employeeDeduction.id, deductionId))
      .returning();

    if (!deleted) return notFound("Deduction");

    logAudit({ ctx, action: "delete", entityType: "employeeDeduction", entityId: deductionId, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
