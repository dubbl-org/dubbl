import { db } from "@/lib/db";
import { payrollRun, payrollItem, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const terminationSchema = z.object({
  employeeId: z.string().uuid(),
  payPeriodStart: z.string().min(1),
  payPeriodEnd: z.string().min(1),
  includeUnusedPto: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = terminationSchema.parse(body);

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, parsed.employeeId),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    if (!emp) return notFound("Employee");

    // Calculate final pay
    let grossAmount = 0;
    if (emp.compensationType === "salary") {
      const dailyRate = Math.round(emp.salary / 365);
      const start = new Date(parsed.payPeriodStart);
      const end = new Date(parsed.payPeriodEnd);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      grossAmount = dailyRate * days;
    } else if (emp.compensationType === "hourly" && emp.hourlyRate) {
      grossAmount = emp.hourlyRate * 80; // default 2 weeks
    }

    // Add PTO payout if requested
    let ptoAmount = 0;
    if (parsed.includeUnusedPto && emp.ptoBalanceHours > 0 && emp.hourlyRate) {
      ptoAmount = Math.round(emp.ptoBalanceHours * emp.hourlyRate);
    } else if (parsed.includeUnusedPto && emp.ptoBalanceHours > 0) {
      ptoAmount = Math.round((emp.salary / 2080) * emp.ptoBalanceHours);
    }

    const totalGross = grossAmount + ptoAmount;
    const taxAmount = Math.round((totalGross * emp.taxRate) / 10000);
    const totalNet = totalGross - taxAmount;

    const [run] = await db
      .insert(payrollRun)
      .values({
        organizationId: ctx.organizationId,
        payPeriodStart: parsed.payPeriodStart,
        payPeriodEnd: parsed.payPeriodEnd,
        runType: "termination",
        notes: parsed.notes || `Termination pay for ${emp.name}`,
        totalGross,
        totalDeductions: taxAmount,
        totalNet,
      })
      .returning();

    const items = [];
    if (grossAmount > 0) {
      items.push({
        payrollRunId: run.id,
        employeeId: emp.id,
        type: "regular_salary" as const,
        description: "Final pay",
        grossAmount,
        taxAmount: Math.round((grossAmount * emp.taxRate) / 10000),
        deductions: Math.round((grossAmount * emp.taxRate) / 10000),
        netAmount: grossAmount - Math.round((grossAmount * emp.taxRate) / 10000),
      });
    }
    if (ptoAmount > 0) {
      items.push({
        payrollRunId: run.id,
        employeeId: emp.id,
        type: "reimbursement" as const,
        description: `PTO payout (${emp.ptoBalanceHours}h)`,
        grossAmount: ptoAmount,
        taxAmount: Math.round((ptoAmount * emp.taxRate) / 10000),
        deductions: Math.round((ptoAmount * emp.taxRate) / 10000),
        netAmount: ptoAmount - Math.round((ptoAmount * emp.taxRate) / 10000),
      });
    }

    if (items.length > 0) {
      await db.insert(payrollItem).values(items);
    }

    // Deactivate and set termination date
    await db
      .update(payrollEmployee)
      .set({
        isActive: false,
        terminationDate: parsed.payPeriodEnd,
        terminationReason: parsed.notes || "Termination",
        updatedAt: new Date(),
      })
      .where(eq(payrollEmployee.id, emp.id));

    logAudit({ ctx, action: "create_termination_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
