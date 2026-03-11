import { db } from "@/lib/db";
import { payrollRun, payrollItem, payrollBonus, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const bonusRunSchema = z.object({
  payPeriodStart: z.string().min(1),
  payPeriodEnd: z.string().min(1),
  notes: z.string().optional(),
  bonuses: z.array(z.object({
    employeeId: z.string().uuid(),
    bonusType: z.enum(["performance", "signing", "referral", "holiday", "spot", "retention", "other"]),
    amount: z.number().int().min(1),
    description: z.string().optional(),
  })).min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = bonusRunSchema.parse(body);

    // Get employees for tax calc
    const empIds = [...new Set(parsed.bonuses.map((b) => b.employeeId))];
    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const items: Array<typeof payrollItem.$inferInsert> = [];

    for (const bonus of parsed.bonuses) {
      const emp = empMap.get(bonus.employeeId);
      const taxRate = emp?.taxRate || 2000;
      const taxAmount = Math.round((bonus.amount * taxRate) / 10000);
      const netAmount = bonus.amount - taxAmount;

      totalGross += bonus.amount;
      totalDeductions += taxAmount;
      totalNet += netAmount;

      items.push({
        payrollRunId: "", // will be set after run creation
        employeeId: bonus.employeeId,
        type: "project_bonus",
        description: bonus.description || `${bonus.bonusType} bonus`,
        grossAmount: bonus.amount,
        taxAmount,
        deductions: taxAmount,
        netAmount,
        bonusAmount: bonus.amount,
      });
    }

    const [run] = await db
      .insert(payrollRun)
      .values({
        organizationId: ctx.organizationId,
        payPeriodStart: parsed.payPeriodStart,
        payPeriodEnd: parsed.payPeriodEnd,
        runType: "bonus_only",
        notes: parsed.notes || "Bonus run",
        totalGross,
        totalDeductions,
        totalNet,
      })
      .returning();

    await db.insert(payrollItem).values(
      items.map((item) => ({ ...item, payrollRunId: run.id }))
    );

    // Also store in payrollBonus table
    await db.insert(payrollBonus).values(
      parsed.bonuses.map((b) => ({
        payrollRunId: run.id,
        employeeId: b.employeeId,
        bonusType: b.bonusType,
        amount: b.amount,
        description: b.description,
      }))
    );

    logAudit({ ctx, action: "create_bonus_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
