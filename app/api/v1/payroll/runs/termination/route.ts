import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItem,
  payrollEmployee,
  payrollSettings,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { postPayrollRun } from "@/lib/api/payroll-posting";
import {
  computeEmployeeWithholding,
  getEmployeeYtdWage,
} from "@/lib/api/payroll-withholding";
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

    // Run the same withholding/FICA engine the regular run uses, so the final
    // paycheck withholds progressive income tax + FICA (against YTD wages / SS
    // cap) and computes employer-side taxes — not a flat emp.taxRate. Final pay
    // and PTO payout are one taxable wage for this period, so the engine is run
    // ONCE on the combined gross to apply the SS/FICA cap correctly; the
    // breakdown is attached to the final-pay item (the PTO item carries 0 tax).
    const settings = await db.query.payrollSettings.findFirst({
      where: eq(payrollSettings.organizationId, ctx.organizationId),
    });
    const ytdWage = await getEmployeeYtdWage(
      ctx.organizationId,
      emp.id,
      parsed.payPeriodStart
    );
    const withholding = await computeEmployeeWithholding(
      ctx.organizationId,
      emp,
      settings ?? undefined,
      totalGross, // no pre-tax deductions on a termination run
      ytdWage,
      parsed.payPeriodStart
    );
    const taxAmount = withholding.totalTax;
    const totalNet = totalGross - taxAmount;

    // Create the run + items, post its journal entry, and complete it atomically.
    const run = await db.transaction(async (tx) => {
      const [createdRun] = await tx
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

      // The final-pay item carries the whole period's withholding; if there is
      // no final-pay line (PTO-only payout), the PTO item carries it instead.
      const taxOnFinalPay = grossAmount > 0;
      const items = [];
      if (grossAmount > 0) {
        items.push({
          payrollRunId: createdRun.id,
          employeeId: emp.id,
          type: "regular_salary" as const,
          description: "Final pay",
          grossAmount,
          taxAmount,
          deductions: taxAmount,
          netAmount: grossAmount - taxAmount,
        });
      }
      if (ptoAmount > 0) {
        const ptoTax = taxOnFinalPay ? 0 : taxAmount;
        items.push({
          payrollRunId: createdRun.id,
          employeeId: emp.id,
          type: "reimbursement" as const,
          description: `PTO payout (${emp.ptoBalanceHours}h)`,
          grossAmount: ptoAmount,
          taxAmount: ptoTax,
          deductions: ptoTax,
          netAmount: ptoAmount - ptoTax,
        });
      }

      const insertedItems =
        items.length > 0
          ? await tx
              .insert(payrollItem)
              .values(items)
              .returning({ id: payrollItem.id })
          : [];

      // Persist the per-jurisdiction breakdown so postPayrollRun buckets the
      // withholding to the right liabilities (FICA → 2235, income tax → 2220)
      // and W-2 boxes are right. Attach to the item that carries the tax.
      const taxItemId = insertedItems[0]?.id;
      if (taxItemId) {
        const taxRows = withholding.breakdown.map((line) => ({
          payrollItemId: taxItemId,
          ...line,
        }));
        const employerRows = withholding.employerBreakdown.map((line) => ({
          payrollItemId: taxItemId,
          ...line,
        }));
        if (taxRows.length > 0)
          await tx.insert(payrollItemTaxBreakdown).values(taxRows);
        if (employerRows.length > 0)
          await tx.insert(payrollItemEmployerTax).values(employerRows);
      }

      // Post the balanced journal entry (gross DR; withholding CR to the proper
      // liability accounts, never the VAT account; net pay CR to bank) and mark
      // the run completed.
      const journalEntryId = await postPayrollRun(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        createdRun.id,
        tx
      );

      const [completed] = await tx
        .update(payrollRun)
        .set({ status: "completed", processedAt: new Date() })
        .where(eq(payrollRun.id, createdRun.id))
        .returning();

      // Deactivate and set termination date
      await tx
        .update(payrollEmployee)
        .set({
          isActive: false,
          terminationDate: parsed.payPeriodEnd,
          terminationReason: parsed.notes || "Termination",
          updatedAt: new Date(),
        })
        .where(eq(payrollEmployee.id, emp.id));

      return { ...completed, journalEntryId };
    });

    logAudit({ ctx, action: "create_termination_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
