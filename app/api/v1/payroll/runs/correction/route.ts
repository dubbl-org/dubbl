import { db } from "@/lib/db";
import { payrollRun, payrollItem, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const correctionSchema = z.object({
  parentRunId: z.string().uuid(),
  notes: z.string().optional(),
  adjustments: z.array(z.object({
    employeeId: z.string().uuid(),
    grossAdjustment: z.number().int(), // can be negative
    description: z.string().optional(),
  })).min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = correctionSchema.parse(body);

    const parentRun = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, parsed.parentRunId),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });

    if (!parentRun) return notFound("Parent payroll run");
    if (parentRun.status !== "completed") return validationError("Can only correct completed runs");

    const employees = await db.query.payrollEmployee.findMany({
      where: eq(payrollEmployee.organizationId, ctx.organizationId),
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const items: Array<typeof payrollItem.$inferInsert> = [];

    for (const adj of parsed.adjustments) {
      const emp = empMap.get(adj.employeeId);
      const taxRate = emp?.taxRate || 2000;
      const taxAmount = Math.round((adj.grossAdjustment * taxRate) / 10000);
      const netAmount = adj.grossAdjustment - taxAmount;

      totalGross += adj.grossAdjustment;
      totalDeductions += taxAmount;
      totalNet += netAmount;

      items.push({
        payrollRunId: "",
        employeeId: adj.employeeId,
        type: adj.grossAdjustment >= 0 ? "regular_salary" : "deduction",
        description: adj.description || "Correction adjustment",
        grossAmount: adj.grossAdjustment,
        taxAmount,
        deductions: taxAmount,
        netAmount,
      });
    }

    const [run] = await db
      .insert(payrollRun)
      .values({
        organizationId: ctx.organizationId,
        payPeriodStart: parentRun.payPeriodStart,
        payPeriodEnd: parentRun.payPeriodEnd,
        runType: "correction",
        parentRunId: parsed.parentRunId,
        notes: parsed.notes || `Correction for run ${parsed.parentRunId.slice(0, 8)}`,
        totalGross,
        totalDeductions,
        totalNet,
      })
      .returning();

    await db.insert(payrollItem).values(
      items.map((item) => ({ ...item, payrollRunId: run.id }))
    );

    logAudit({ ctx, action: "create_correction_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
