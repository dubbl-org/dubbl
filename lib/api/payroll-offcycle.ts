/**
 * Off-cycle payroll runs, shared by the REST routes and the MCP tools: bonus
 * only, final pay for someone leaving, and corrections to a finished run.
 * Each is created and finished (posted) straight away, unless payroll runs
 * need sign-off, in which case it is left as a draft. Rule violations throw
 * ApprovalError (400/404 with the message).
 */
import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItem,
  payrollBonus,
  payrollEmployee,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
  employeeLeaveBalance,
  leavePolicy,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  buildEmployeePayItem,
  createRunBuildContext,
  insertPayItems,
  sumRunTotals,
  timesheetPay,
  type BuiltPayItem,
} from "@/lib/api/payroll-run-builder";
import { type TaxBreakdownLine, type EmployerTaxLine } from "@/lib/api/payroll-withholding";
import { finishOffCycleRun } from "@/lib/api/payroll-run-actions";
import { syncLeaveBalances } from "@/lib/api/leave-balances";
import { ApprovalError } from "@/lib/approvals/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import { z } from "zod";

export const bonusRunSchema = z.object({
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

export const terminationSchema = z.object({
  employeeId: z.string().uuid(),
  payPeriodStart: z.string().min(1),
  payPeriodEnd: z.string().min(1),
  includeUnusedPto: z.boolean().optional(),
  notes: z.string().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday to Friday days between two dates, inclusive. */
function weekdaysBetween(start: string, end: string): number {
  let count = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY_MS) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export const correctionSchema = z.object({
  parentRunId: z.string().uuid(),
  notes: z.string().optional(),
  adjustments: z.array(z.object({
    employeeId: z.string().uuid(),
    grossAdjustment: z.number().int(), // can be negative
    description: z.string().optional(),
  })).min(1),
});

/**
 * Pay one or more bonuses outside the regular run. Each employee's bonuses are
 * added up and taxed together through the same withholding engine as a
 * regular run (income tax + FICA against their YTD wages, plus employer
 * taxes). The run is finished and posted straight away, unless payroll runs
 * need sign-off, in which case it is left as a draft to send for sign-off.
 */
export async function createBonusOnlyRun(ctx: AuthContext, input: unknown) {
    const parsed = bonusRunSchema.parse(input);
    if (parsed.payPeriodEnd < parsed.payPeriodStart) {
      throw new ApprovalError("The pay period end must be on or after its start");
    }
    await assertNotLocked(ctx.organizationId, parsed.payPeriodEnd, ctx);

    const employeeIds = [...new Set(parsed.bonuses.map((b) => b.employeeId))];
    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        inArray(payrollEmployee.id, employeeIds),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    if (employees.length !== employeeIds.length) {
      throw new ApprovalError("One or more employees weren't found");
    }

    const bctx = await createRunBuildContext(
      ctx.organizationId,
      parsed.payPeriodStart,
      parsed.payPeriodEnd,
      employees
    );
    const items: BuiltPayItem[] = [];
    for (const emp of employees) {
      const item = await buildEmployeePayItem(bctx, emp, {
        base: false,
        applyDeductions: false,
        bonuses: parsed.bonuses
          .filter((b) => b.employeeId === emp.id)
          .map((b) => ({ amount: b.amount, description: b.description || `${b.bonusType} bonus` })),
      });
      if (item) items.push(item);
    }

    const totals = sumRunTotals(items.map((i) => ({
      grossAmount: i.columns.grossAmount,
      deductions: i.columns.deductions ?? 0,
      netAmount: i.columns.netAmount,
      fxRate: i.columns.fxRate,
    })));

    const draft = await db.transaction(async (tx) => {
      const [createdRun] = await tx
        .insert(payrollRun)
        .values({
          organizationId: ctx.organizationId,
          payPeriodStart: parsed.payPeriodStart,
          payPeriodEnd: parsed.payPeriodEnd,
          runType: "bonus_only",
          notes: parsed.notes || "Bonus run",
          ...totals,
        })
        .returning();

      await insertPayItems(tx, createdRun.id, items);
      await tx.insert(payrollBonus).values(
        parsed.bonuses.map((b) => ({
          payrollRunId: createdRun.id,
          employeeId: b.employeeId,
          bonusType: b.bonusType,
          amount: b.amount,
          description: b.description,
        }))
      );
      return createdRun;
    });

    const run = await finishOffCycleRun(ctx, draft);


    return run;
}

/**
 * Final pay for someone leaving: pay for the days worked in the final period
 * (salary at a daily rate, or hourly from approved timesheets, else 8 hours a
 * weekday), plus optionally their unused vacation/personal leave paid out. The
 * whole amount is one pay item, taxed and with deductions like a regular run.
 * The employee is marked inactive with the period end as their last day.
 */
export async function createFinalPayRun(ctx: AuthContext, input: unknown) {
    const parsed = terminationSchema.parse(input);
    if (parsed.payPeriodEnd < parsed.payPeriodStart) {
      throw new ApprovalError("The pay period end must be on or after its start");
    }
    await assertNotLocked(ctx.organizationId, parsed.payPeriodEnd, ctx);

    const where = and(
      eq(payrollEmployee.id, parsed.employeeId),
      eq(payrollEmployee.organizationId, ctx.organizationId),
      notDeleted(payrollEmployee.deletedAt)
    );
    let emp = await db.query.payrollEmployee.findFirst({ where });
    if (!emp) throw new ApprovalError("Employee not found", 404);

    // Bring leave balances up to date so the payout uses today's figure.
    if (parsed.includeUnusedPto) {
      await syncLeaveBalances(ctx.organizationId, { employeeIds: [emp.id] });
      emp = (await db.query.payrollEmployee.findFirst({ where })) ?? emp;
    }

    const bctx = await createRunBuildContext(
      ctx.organizationId,
      parsed.payPeriodStart,
      parsed.payPeriodEnd,
      [emp]
    );

    // Pay for the final period.
    let finalPay = 0;
    let finalNote = "";
    if (emp.compensationType === "hourly" && emp.hourlyRate) {
      const { pay } = await timesheetPay(bctx, emp, emp.hourlyRate);
      if (pay.totalHours > 0) {
        finalPay = pay.grossAmount;
        finalNote = `Final pay: ${pay.totalHours}h from approved timesheets`;
      } else {
        const hours = weekdaysBetween(parsed.payPeriodStart, parsed.payPeriodEnd) * 8;
        finalPay = Math.round(hours * emp.hourlyRate);
        finalNote = `Final pay: ${hours}h (8h a weekday, no approved timesheet)`;
      }
    } else if (emp.compensationType === "salary") {
      const days =
        Math.round(
          (Date.parse(`${parsed.payPeriodEnd}T00:00:00Z`) - Date.parse(`${parsed.payPeriodStart}T00:00:00Z`)) / DAY_MS
        ) + 1;
      finalPay = Math.round((emp.salary * days) / 365);
      finalNote = `Final pay: ${days} days at ${(emp.salary / 36500).toFixed(2)}/day`;
    }

    // Unused vacation/personal leave, paid at the hourly rate (salary ÷ 2,080).
    let ptoAmount = 0;
    const ptoHours = parsed.includeUnusedPto ? Math.max(0, emp.ptoBalanceHours) : 0;
    if (ptoHours > 0) {
      const hourly = emp.hourlyRate ?? emp.salary / 2080;
      ptoAmount = Math.round(ptoHours * hourly);
    }

    const notes = [finalNote, ptoAmount > 0 ? `unused leave paid out (${ptoHours}h)` : ""].filter(Boolean);
    const item = await buildEmployeePayItem(bctx, emp, {
      base: true,
      fixedBase: { amount: finalPay + ptoAmount, type: "regular_salary", note: notes.join("; ") },
    });
    if (!item) throw new ApprovalError("There is nothing to pay for this period");

    const totals = sumRunTotals([{
      grossAmount: item.columns.grossAmount,
      deductions: item.columns.deductions ?? 0,
      netAmount: item.columns.netAmount,
      fxRate: item.columns.fxRate,
    }]);

    const draft = await db.transaction(async (tx) => {
      const [createdRun] = await tx
        .insert(payrollRun)
        .values({
          organizationId: ctx.organizationId,
          payPeriodStart: parsed.payPeriodStart,
          payPeriodEnd: parsed.payPeriodEnd,
          runType: "termination",
          notes: parsed.notes || `Termination pay for ${emp.name}`,
          ...totals,
        })
        .returning();
      await insertPayItems(tx, createdRun.id, [item]);

      // Paid-out leave is used up.
      if (ptoAmount > 0) {
        const ptoPolicies = await tx
          .select({ id: leavePolicy.id })
          .from(leavePolicy)
          .where(and(
            eq(leavePolicy.organizationId, ctx.organizationId),
            inArray(leavePolicy.leaveType, ["vacation", "personal"])
          ));
        if (ptoPolicies.length > 0) {
          await tx
            .update(employeeLeaveBalance)
            .set({ balance: 0, updatedAt: new Date() })
            .where(and(
              eq(employeeLeaveBalance.employeeId, emp.id),
              inArray(employeeLeaveBalance.policyId, ptoPolicies.map((p) => p.id))
            ));
        }
      }

      // Mark them as leaving: inactive, with the period end as the last day.
      await tx
        .update(payrollEmployee)
        .set({
          isActive: false,
          endDate: parsed.payPeriodEnd,
          terminationDate: parsed.payPeriodEnd,
          terminationReason: parsed.notes || "Termination",
          ptoBalanceHours: ptoAmount > 0 ? 0 : emp.ptoBalanceHours,
          updatedAt: new Date(),
        })
        .where(eq(payrollEmployee.id, emp.id));

      return createdRun;
    });

    const run = await finishOffCycleRun(ctx, draft);


    return run;
}

/**
 * Correct a finished run: one signed gross adjustment per employee who was
 * paid in it. Tax and employer tax are scaled from that employee's original
 * split, so each liability moves back (or forward) in proportion, and the
 * run is posted against the parent's period end.
 */
export async function createCorrectionRun(ctx: AuthContext, input: unknown) {
    const parsed = correctionSchema.parse(input);

    const parentRun = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, parsed.parentRunId),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
      with: { items: true },
    });

    if (!parentRun) throw new ApprovalError("Parent payroll run not found", 404);
    if (parentRun.status !== "completed") throw new ApprovalError("Can only correct completed runs");
    const paidInParent = new Set(parentRun.items.map((i) => i.employeeId));
    if (parsed.adjustments.some((a) => !paidInParent.has(a.employeeId))) {
      throw new ApprovalError("Each adjustment must be for someone paid in that payroll");
    }
    if (parsed.adjustments.some((a) => a.grossAdjustment === 0)) {
      throw new ApprovalError("Adjustments can't be zero");
    }
    // The correction is dated the parent's period end.
    await assertNotLocked(ctx.organizationId, parentRun.payPeriodEnd, ctx);

    // Aggregate the PARENT run's actual per-employee gross + withholding split so
    // a correction reverses (or adds to) the SAME proportional mix of income tax
    // / FICA / pension / employer taxes the parent posted — rather than dumping a
    // flat tax to income-tax payable. The persisted correction breakdown then
    // matches the journal split postPayrollRun derives from the parent.
    const parentItemIds = parentRun.items.map((i) => i.id);
    const parentTaxRows = parentItemIds.length
      ? await db.query.payrollItemTaxBreakdown.findMany({
          where: inArray(payrollItemTaxBreakdown.payrollItemId, parentItemIds),
        })
      : [];
    const parentEmployerRows = parentItemIds.length
      ? await db.query.payrollItemEmployerTax.findMany({
          where: inArray(payrollItemEmployerTax.payrollItemId, parentItemIds),
        })
      : [];

    interface ParentAgg {
      gross: number; // local-currency cents (parent)
      currency: string;
      fxRate: number;
      breakdown: TaxBreakdownLine[];
      employerBreakdown: EmployerTaxLine[];
    }
    const parentByEmp = new Map<string, ParentAgg>();
    const itemEmp = new Map<string, string>(); // parent itemId → employeeId
    for (const it of parentRun.items) {
      itemEmp.set(it.id, it.employeeId);
      const agg = parentByEmp.get(it.employeeId) ?? {
        gross: 0,
        currency: it.currency ?? "USD",
        fxRate: it.fxRate ?? 1,
        breakdown: [],
        employerBreakdown: [],
      };
      agg.gross += it.grossAmount;
      parentByEmp.set(it.employeeId, agg);
    }
    for (const tb of parentTaxRows) {
      const empId = itemEmp.get(tb.payrollItemId);
      const agg = empId ? parentByEmp.get(empId) : undefined;
      if (agg)
        agg.breakdown.push({
          jurisdictionLevel: tb.jurisdictionLevel,
          jurisdiction: tb.jurisdiction,
          taxKind: tb.taxKind,
          amount: tb.amount,
        });
    }
    for (const et of parentEmployerRows) {
      const empId = itemEmp.get(et.payrollItemId);
      const agg = empId ? parentByEmp.get(empId) : undefined;
      if (agg)
        agg.employerBreakdown.push({
          jurisdictionLevel: et.jurisdictionLevel,
          jurisdiction: et.jurisdiction,
          taxKind: et.taxKind,
          amount: et.amount,
        });
    }

    // Each item carries the breakdown rows it should persist (aligned by index).
    const items: Array<
      typeof payrollItem.$inferInsert & {
        taxBreakdown: TaxBreakdownLine[];
        employerTaxBreakdown: EmployerTaxLine[];
      }
    > = [];

    for (const adj of parsed.adjustments) {
      const parentAgg = parentByEmp.get(adj.employeeId);

      // Scale the parent's per-bucket split by this adjustment's proportion of
      // the parent's gross for the same employee (signed: a negative adjustment
      // produces negative breakdown amounts that reverse the parent's credits).
      let taxBreakdown: TaxBreakdownLine[] = [];
      let employerTaxBreakdown: EmployerTaxLine[] = [];
      let taxAmount = 0;
      // Match the parent's currency so postPayrollRun converts consistently.
      let currency = "USD";
      let fxRate = 1;

      if (parentAgg && parentAgg.gross !== 0) {
        const ratio = adj.grossAdjustment / parentAgg.gross;
        currency = parentAgg.currency;
        fxRate = parentAgg.fxRate;
        taxBreakdown = parentAgg.breakdown
          .map((line) => ({ ...line, amount: Math.round(line.amount * ratio) }))
          .filter((line) => line.amount !== 0);
        employerTaxBreakdown = parentAgg.employerBreakdown
          .map((line) => ({ ...line, amount: Math.round(line.amount * ratio) }))
          .filter((line) => line.amount !== 0);
        taxAmount = taxBreakdown.reduce((s, l) => s + l.amount, 0);
      }

      const netAmount = adj.grossAdjustment - taxAmount;

      items.push({
        payrollRunId: "",
        employeeId: adj.employeeId,
        type: adj.grossAdjustment >= 0 ? "regular_salary" : "deduction",
        description: adj.description || "Correction adjustment",
        grossAmount: adj.grossAdjustment,
        taxAmount,
        deductions: taxAmount,
        netAmount,
        currency,
        fxRate,
        taxBreakdown,
        employerTaxBreakdown,
      });
    }

    // Create the correction run + items, post its adjusting journal entry, and
    // complete it atomically. The posting helper books the SIGNED deltas (a
    // negative adjustment self-reverses into the opposite debit/credit column),
    // crediting withholdings to the proper liability accounts — never the VAT
    // account — by reversing the parent's per-bucket split in the same proportion
    // (via parentRunId), so the parent's FICA/pension/income-tax liabilities net
    // back correctly.
    const draft = await db.transaction(async (tx) => {
      const [createdRun] = await tx
        .insert(payrollRun)
        .values({
          organizationId: ctx.organizationId,
          payPeriodStart: parentRun.payPeriodStart,
          payPeriodEnd: parentRun.payPeriodEnd,
          runType: "correction",
          parentRunId: parsed.parentRunId,
          notes: parsed.notes || `Correction for run ${parsed.parentRunId.slice(0, 8)}`,
          ...sumRunTotals(items),
        })
        .returning();

      // Insert items (stripping breakdown fields) and capture ids so we can
      // attach the proportionally-scaled per-jurisdiction breakdown rows.
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

      return createdRun;
    });

    const run = await finishOffCycleRun(ctx, draft);


    return run;
}
