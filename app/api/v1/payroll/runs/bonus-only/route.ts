import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItem,
  payrollBonus,
  payrollEmployee,
  payrollSettings,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { postPayrollRun } from "@/lib/api/payroll-posting";
import {
  computeEmployeeWithholding,
  getEmployeeYtdWage,
  type TaxBreakdownLine,
  type EmployerTaxLine,
} from "@/lib/api/payroll-withholding";
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
    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const settings = await db.query.payrollSettings.findFirst({
      where: eq(payrollSettings.organizationId, ctx.organizationId),
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    // Each item carries its own breakdown rows (aligned by index when inserted).
    const items: Array<
      typeof payrollItem.$inferInsert & {
        taxBreakdown: TaxBreakdownLine[];
        employerTaxBreakdown: EmployerTaxLine[];
      }
    > = [];

    // Bonuses are run through the same withholding/FICA engine as a regular run,
    // using its periodic method (the engine has no separate supplemental flat
    // rate) — the bonus is treated as this period's taxable wage. Bonuses for the
    // SAME employee in this run are summed so the SS/FICA wage-base cap is applied
    // once; the resulting breakdown is attached to that employee's FIRST bonus
    // item (so postPayrollRun buckets FICA→2235 / income tax→2220 correctly and
    // W-2 boxes are right), with the remaining items carrying zero tax.
    const bonusesByEmp = new Map<string, typeof parsed.bonuses>();
    for (const bonus of parsed.bonuses) {
      const list = bonusesByEmp.get(bonus.employeeId) ?? [];
      list.push(bonus);
      bonusesByEmp.set(bonus.employeeId, list);
    }

    for (const [employeeId, empBonuses] of bonusesByEmp.entries()) {
      const emp = empMap.get(employeeId);

      let taxBreakdown: TaxBreakdownLine[] = [];
      let employerTaxBreakdown: EmployerTaxLine[] = [];
      let taxAmount = 0;

      if (emp) {
        const bonusGross = empBonuses.reduce((s, b) => s + b.amount, 0);
        const ytdWage = await getEmployeeYtdWage(
          ctx.organizationId,
          emp.id,
          parsed.payPeriodStart
        );
        const withholding = await computeEmployeeWithholding(
          ctx.organizationId,
          emp,
          settings ?? undefined,
          bonusGross, // bonuses have no pre-tax deductions
          ytdWage,
          parsed.payPeriodStart
        );
        taxBreakdown = withholding.breakdown;
        employerTaxBreakdown = withholding.employerBreakdown;
        taxAmount = withholding.totalTax;
      }

      empBonuses.forEach((bonus, idx) => {
        // The first item for the employee carries the whole withholding; the rest
        // carry zero so per-item amounts sum to the employee's total.
        const itemTax = idx === 0 ? taxAmount : 0;
        const netAmount = bonus.amount - itemTax;

        totalGross += bonus.amount;
        totalDeductions += itemTax;
        totalNet += netAmount;

        items.push({
          payrollRunId: "", // will be set after run creation
          employeeId,
          type: "project_bonus",
          description: bonus.description || `${bonus.bonusType} bonus`,
          grossAmount: bonus.amount,
          taxAmount: itemTax,
          deductions: itemTax,
          netAmount,
          bonusAmount: bonus.amount,
          taxBreakdown: idx === 0 ? taxBreakdown : [],
          employerTaxBreakdown: idx === 0 ? employerTaxBreakdown : [],
        });
      });
    }

    // Create the run + items + bonus rows, post its journal entry, and complete
    // it atomically so the bonus pay actually reaches the books.
    const run = await db.transaction(async (tx) => {
      const [createdRun] = await tx
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

      // Insert items (stripping the breakdown fields, which live in their own
      // tables) and capture ids so we can attach the per-item breakdown rows.
      const insertedItems = await tx
        .insert(payrollItem)
        .values(
          items.map((item) => {
            const { taxBreakdown, employerTaxBreakdown, ...columns } = item;
            void taxBreakdown;
            void employerTaxBreakdown;
            return { ...columns, payrollRunId: createdRun.id };
          })
        )
        .returning({ id: payrollItem.id });

      // Persist per-jurisdiction employee + employer tax breakdown rows aligned
      // by index with the items just inserted, so postPayrollRun splits the
      // withholding to the correct liability accounts.
      const taxRows: (typeof payrollItemTaxBreakdown.$inferInsert)[] = [];
      const employerRows: (typeof payrollItemEmployerTax.$inferInsert)[] = [];
      items.forEach((item, idx) => {
        const payrollItemId = insertedItems[idx].id;
        for (const line of item.taxBreakdown) {
          taxRows.push({ payrollItemId, ...line });
        }
        for (const line of item.employerTaxBreakdown) {
          employerRows.push({ payrollItemId, ...line });
        }
      });
      if (taxRows.length > 0)
        await tx.insert(payrollItemTaxBreakdown).values(taxRows);
      if (employerRows.length > 0)
        await tx.insert(payrollItemEmployerTax).values(employerRows);

      // Also store in payrollBonus table
      await tx.insert(payrollBonus).values(
        parsed.bonuses.map((b) => ({
          payrollRunId: createdRun.id,
          employeeId: b.employeeId,
          bonusType: b.bonusType,
          amount: b.amount,
          description: b.description,
        }))
      );

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

      return { ...completed, journalEntryId };
    });

    logAudit({ ctx, action: "create_bonus_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}
