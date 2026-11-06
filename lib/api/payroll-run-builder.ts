/**
 * Builds the pay items for a payroll run: gross pay (salary, approved timesheet
 * hours with weekly overtime and shift premiums, bonuses, less unpaid leave),
 * each employee's deductions, and the tax withholding. Shared by the REST run
 * routes and the MCP payroll tools so both calculate a run the same way.
 *
 * Every item is persisted with its full breakdown: payrollItemTaxBreakdown,
 * payrollItemEmployerTax and payrollItemDeduction. postPayrollRun reads those
 * rows to credit each withholding to its liability account, so take-home pay
 * credited to the bank always equals gross − tax − deductions.
 *
 * All amounts are integer cents in the employee's own currency; run totals are
 * converted to the org default currency at each item's fxRate.
 */
import { db } from "@/lib/db";
import {
  payrollEmployee,
  payrollItem,
  payrollRun,
  payrollBonus,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
  payrollItemDeduction,
  employeeDeduction,
  timesheet,
  leaveRequest,
  shiftDefinition,
} from "@/lib/db/schema";
import { and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getExchangeRate } from "@/lib/currency/converter";
import {
  computeEmployeeWithholding,
  getEmployeeYtdWage,
  resolvePayrollSettings,
  type TaxBreakdownLine,
  type EmployerTaxLine,
} from "@/lib/api/payroll-withholding";
import { computeHourlyPay, standardPeriodHours, leaveHoursInPeriod } from "@/lib/payroll/overtime";
import {
  periodGross,
  computeDeductionLines,
  capLines,
  type DeductionLine,
} from "@/lib/payroll/calculations";

type DbOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type EmployeeRow = typeof payrollEmployee.$inferSelect;
type SettingsRow = Awaited<ReturnType<typeof resolvePayrollSettings>>;

/** Yearly hours used to turn a salary into an hourly figure (40h × 52 weeks). */
const HOURS_PER_YEAR = 2080;

export interface BuiltPayItem {
  columns: Omit<typeof payrollItem.$inferInsert, "payrollRunId">;
  taxBreakdown: TaxBreakdownLine[];
  employerTaxBreakdown: EmployerTaxLine[];
  deductionLines: DeductionLine[];
}

export interface RunBuildContext {
  organizationId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  settings: SettingsRow;
  defaultCurrency: string;
  /** currency → rate to the default currency, ×1,000,000 (see getExchangeRate). */
  fxRates: Map<string, number>;
  /** Extra % per shift type from the org's active shift definitions. */
  shiftPremiums: Record<string, number>;
}

export interface BonusInput {
  amount: number; // cents
  description?: string | null;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function hoursLabel(h: number): string {
  return `${Math.round(h * 100) / 100}h`;
}

/** Load settings, FX rates and shift premiums once for a whole run. */
export async function createRunBuildContext(
  organizationId: string,
  payPeriodStart: string,
  payPeriodEnd: string,
  employees: EmployeeRow[],
  exec: DbOrTx = db
): Promise<RunBuildContext> {
  const settings = await resolvePayrollSettings(organizationId, exec);
  const defaultCurrency = settings.defaultCurrency ?? "USD";

  const fxRates = new Map<string, number>();
  for (const emp of employees) {
    const cur = emp.currency ?? defaultCurrency;
    if (cur !== defaultCurrency && !fxRates.has(cur)) {
      const rate = await getExchangeRate(organizationId, cur, defaultCurrency, payPeriodEnd);
      if (rate != null) fxRates.set(cur, rate);
    }
  }

  const shifts = await exec
    .select({ shiftType: shiftDefinition.shiftType, premiumPercent: shiftDefinition.premiumPercent })
    .from(shiftDefinition)
    .where(
      and(
        eq(shiftDefinition.organizationId, organizationId),
        eq(shiftDefinition.isActive, true),
        isNull(shiftDefinition.deletedAt)
      )
    );
  const shiftPremiums: Record<string, number> = {};
  for (const s of shifts) {
    const pct = s.premiumPercent ?? 0;
    if (pct > (shiftPremiums[s.shiftType] ?? 0)) shiftPremiums[s.shiftType] = pct;
  }

  return { organizationId, payPeriodStart, payPeriodEnd, settings, defaultCurrency, fxRates, shiftPremiums };
}

/** Approved unpaid-leave hours falling inside the pay period. */
async function unpaidLeaveHours(bctx: RunBuildContext, employeeId: string, exec: DbOrTx): Promise<number> {
  const requests = await exec.query.leaveRequest.findMany({
    where: and(
      eq(leaveRequest.organizationId, bctx.organizationId),
      eq(leaveRequest.employeeId, employeeId),
      eq(leaveRequest.status, "approved"),
      lte(leaveRequest.startDate, bctx.payPeriodEnd),
      gte(leaveRequest.endDate, bctx.payPeriodStart)
    ),
    with: { policy: { columns: { leaveType: true } } },
  });
  return leaveHoursInPeriod(
    requests.filter((r) => r.policy?.leaveType === "unpaid"),
    bctx.payPeriodStart,
    bctx.payPeriodEnd
  );
}

/**
 * Pay for the hours on the employee's approved timesheets that fall inside the
 * pay period (weekly overtime and shift premiums applied).
 */
export async function timesheetPay(
  bctx: RunBuildContext,
  emp: EmployeeRow,
  hourlyRate: number,
  exec: DbOrTx = db
) {
  const approved = await exec.query.timesheet.findMany({
    where: and(
      eq(timesheet.organizationId, bctx.organizationId),
      eq(timesheet.employeeId, emp.id),
      eq(timesheet.status, "approved"),
      notDeleted(timesheet.deletedAt),
      lte(timesheet.periodStart, bctx.payPeriodEnd),
      gte(timesheet.periodEnd, bctx.payPeriodStart)
    ),
    with: { entries: true },
  });
  const pay = computeHourlyPay({
    hourlyRate,
    entries: approved.flatMap((t) => t.entries),
    periodStart: bctx.payPeriodStart,
    periodEnd: bctx.payPeriodEnd,
    weeklyThresholdHours: bctx.settings.overtimeThresholdHours,
    overtimeMultiplier: bctx.settings.overtimeMultiplier,
    shiftPremiums: bctx.shiftPremiums,
  });
  return { pay, timesheetId: approved[0]?.id ?? null };
}

/**
 * Calculate one employee's pay item for the run.
 *
 * @param opts.base include the employee's regular pay (salary or hours); false
 *   for a bonus-only run
 * @param opts.bonuses bonuses paid in this run, added to gross and taxed with it
 * @param opts.applyDeductions withhold the employee's assigned deductions
 * Returns null when there is nothing to pay.
 */
export async function buildEmployeePayItem(
  bctx: RunBuildContext,
  emp: EmployeeRow,
  opts: {
    base: boolean;
    bonuses?: BonusInput[];
    applyDeductions?: boolean;
    /** Use this amount as the regular pay instead of working it out (final pay). */
    fixedBase?: { amount: number; type: typeof payrollItem.$inferInsert.type; note: string };
  },
  exec: DbOrTx = db
): Promise<BuiltPayItem | null> {
  const { settings, payPeriodStart, payPeriodEnd } = bctx;
  let baseGross = 0;
  let itemType: typeof payrollItem.$inferInsert.type = "regular_salary";
  const notes: string[] = [];
  let overtimeHours: number | null = null;
  let overtimeAmount: number | null = null;
  let timesheetId: string | null = null;

  if (opts.fixedBase) {
    baseGross = Math.max(0, opts.fixedBase.amount);
    itemType = opts.fixedBase.type;
    notes.push(opts.fixedBase.note);
  } else if (opts.base) {
    if (emp.compensationType === "hourly" && emp.hourlyRate) {
      itemType = "hourly_pay";
      const { pay, timesheetId: firstTimesheetId } = await timesheetPay(bctx, emp, emp.hourlyRate, exec);

      if (pay.totalHours > 0) {
        timesheetId = firstTimesheetId;
        baseGross = pay.grossAmount;
        notes.push(`${hoursLabel(pay.regularHours)} @ ${money(emp.hourlyRate)}/hr`);
        if (pay.overtimeHours > 0) {
          overtimeHours = pay.overtimeHours;
          overtimeAmount = pay.overtimeAmount;
          notes.push(
            `${hoursLabel(pay.overtimeHours)} overtime @ ${money(Math.round(emp.hourlyRate * settings.overtimeMultiplier))}/hr`
          );
        }
        if (pay.premiumAmount > 0) {
          notes.push(`shift premiums ${money(pay.premiumAmount)} on ${hoursLabel(pay.premiumHours)}`);
        }
      } else {
        // No approved timesheet: pay the standard hours for the period, less
        // any approved unpaid leave. Standard hours are never overtime.
        const unpaid = await unpaidLeaveHours(bctx, emp.id, exec);
        const standard = standardPeriodHours(emp.payFrequency);
        const hours = Math.max(0, Math.round((standard - unpaid) * 100) / 100);
        baseGross = Math.round(hours * emp.hourlyRate);
        notes.push(`${hoursLabel(hours)} standard hours @ ${money(emp.hourlyRate)}/hr (no approved timesheet)`);
        if (unpaid > 0) notes.push(`${hoursLabel(unpaid)} unpaid leave not paid`);
      }
    } else if (emp.compensationType === "salary") {
      itemType = "regular_salary";
      baseGross = periodGross(emp.salary, emp.payFrequency);
      const unpaid = await unpaidLeaveHours(bctx, emp.id, exec);
      if (unpaid > 0) {
        const cut = Math.min(baseGross, Math.round((unpaid * emp.salary) / HOURS_PER_YEAR));
        baseGross -= cut;
        notes.push(`less ${hoursLabel(unpaid)} unpaid leave (${money(cut)})`);
      }
    }
    // Milestone and commission employees are paid when a milestone or
    // commission is recorded, not by the regular run.
  }

  const bonuses = (opts.bonuses ?? []).filter((b) => b.amount > 0);
  const bonusAmount = bonuses.reduce((s, b) => s + b.amount, 0);
  if (bonusAmount > 0) {
    if (baseGross === 0) itemType = "project_bonus";
    const labels = bonuses.map((b) => b.description || "bonus");
    notes.push(`${baseGross > 0 ? "plus " : ""}${labels.join(", ")} ${money(bonusAmount)}`);
  }

  const grossAmount = baseGross + bonusAmount;
  if (grossAmount <= 0) return null;

  // Deductions assigned to the employee (their own amount/percent, else the
  // deduction type's default). Pre-tax lines lower the taxable wage.
  let deductionLines: DeductionLine[] = [];
  if (opts.applyDeductions !== false) {
    const assigned = await exec.query.employeeDeduction.findMany({
      where: and(
        eq(employeeDeduction.employeeId, emp.id),
        eq(employeeDeduction.isActive, true),
        notDeleted(employeeDeduction.deletedAt)
      ),
      with: { deductionType: true },
    });
    deductionLines = computeDeductionLines(
      grossAmount,
      assigned
        .filter((d) => d.deductionType?.isActive && !d.deductionType.deletedAt)
        .map((d) => ({
          deductionTypeId: d.deductionTypeId,
          name: d.deductionType.name,
          category: d.deductionType.category,
          amount: d.amount,
          percent: d.percent,
          defaultAmount: d.deductionType.defaultAmount,
          defaultPercent: d.deductionType.defaultPercent,
          startDate: d.startDate,
          endDate: d.endDate,
        })),
      payPeriodStart,
      payPeriodEnd
    );
  }

  const preTax = deductionLines.filter((l) => l.category === "pre_tax");
  const preTaxTotal = preTax.reduce((s, l) => s + l.amount, 0);
  const taxableIncome = Math.max(0, grossAmount - preTaxTotal);

  const ytdWage = await getEmployeeYtdWage(bctx.organizationId, emp.id, payPeriodStart, exec);
  const withholding = await computeEmployeeWithholding(
    bctx.organizationId,
    emp,
    settings,
    taxableIncome,
    ytdWage,
    payPeriodStart,
    exec
  );
  const taxAmount = withholding.totalTax;

  // Post-tax deductions can't take pay below zero.
  const postTax = capLines(
    deductionLines.filter((l) => l.category === "post_tax"),
    grossAmount - preTaxTotal - taxAmount
  );
  const postTaxTotal = postTax.reduce((s, l) => s + l.amount, 0);
  deductionLines = [...preTax, ...postTax];

  // deductions = everything held back: employee tax + pre-tax + post-tax.
  const deductions = taxAmount + preTaxTotal + postTaxTotal;
  const currency = emp.currency ?? bctx.defaultCurrency;
  const rateInt = currency === bctx.defaultCurrency ? 1_000_000 : bctx.fxRates.get(currency);

  return {
    columns: {
      employeeId: emp.id,
      type: itemType,
      description: notes.length > 0 ? notes.join("; ") : null,
      grossAmount,
      taxAmount,
      deductions,
      netAmount: grossAmount - deductions,
      overtimeHours,
      overtimeAmount,
      bonusAmount: bonusAmount > 0 ? bonusAmount : null,
      preTaxDeductions: preTaxTotal,
      postTaxDeductions: postTaxTotal,
      timesheetId,
      currency,
      fxRate: rateInt != null ? rateInt / 1_000_000 : 1,
    },
    taxBreakdown: withholding.breakdown,
    employerTaxBreakdown: withholding.employerBreakdown,
    deductionLines,
  };
}

/** Active employees who are employed during the pay period. */
export async function loadPayableEmployees(
  organizationId: string,
  payPeriodStart: string,
  payPeriodEnd: string,
  exec: DbOrTx = db
): Promise<EmployeeRow[]> {
  const rows = await exec.query.payrollEmployee.findMany({
    where: and(
      eq(payrollEmployee.organizationId, organizationId),
      eq(payrollEmployee.isActive, true),
      notDeleted(payrollEmployee.deletedAt)
    ),
  });
  return rows.filter((e) => {
    if (e.startDate && e.startDate > payPeriodEnd) return false;
    const left = e.terminationDate ?? e.endDate;
    if (left && left < payPeriodStart) return false;
    return true;
  });
}

/** Build every employee's item for a regular (or off-cycle) run. */
export async function buildRegularRunItems(
  organizationId: string,
  payPeriodStart: string,
  payPeriodEnd: string,
  exec: DbOrTx = db
): Promise<{ items: BuiltPayItem[]; employeeCount: number }> {
  const employees = await loadPayableEmployees(organizationId, payPeriodStart, payPeriodEnd, exec);
  const bctx = await createRunBuildContext(organizationId, payPeriodStart, payPeriodEnd, employees, exec);
  const items: BuiltPayItem[] = [];
  for (const emp of employees) {
    const item = await buildEmployeePayItem(bctx, emp, { base: true }, exec);
    if (item) items.push(item);
  }
  return { items, employeeCount: employees.length };
}

/**
 * Run totals in the org default currency. Each item converts at its own
 * fxRate, the same way postPayrollRun converts, so the run header and the
 * journal entry agree. `deductions` already includes tax.
 */
export function sumRunTotals(
  items: { grossAmount: number; deductions?: number | null; netAmount: number; fxRate?: number | null }[]
): { totalGross: number; totalDeductions: number; totalNet: number } {
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  for (const it of items) {
    const rate = it.fxRate ?? 1;
    totalGross += Math.round(it.grossAmount * rate);
    totalDeductions += Math.round((it.deductions ?? 0) * rate);
    totalNet += Math.round(it.netAmount * rate);
  }
  return { totalGross, totalDeductions, totalNet };
}

/** Insert built items with their tax, employer-tax and deduction rows. */
export async function insertPayItems(tx: Tx, payrollRunId: string, items: BuiltPayItem[]): Promise<void> {
  if (items.length === 0) return;
  const inserted = await tx
    .insert(payrollItem)
    .values(items.map((i) => ({ ...i.columns, payrollRunId })))
    .returning({ id: payrollItem.id });

  const taxRows: (typeof payrollItemTaxBreakdown.$inferInsert)[] = [];
  const employerRows: (typeof payrollItemEmployerTax.$inferInsert)[] = [];
  const deductionRows: (typeof payrollItemDeduction.$inferInsert)[] = [];
  items.forEach((item, idx) => {
    const payrollItemId = inserted[idx].id;
    for (const line of item.taxBreakdown) taxRows.push({ payrollItemId, ...line });
    for (const line of item.employerTaxBreakdown) employerRows.push({ payrollItemId, ...line });
    for (const line of item.deductionLines) {
      deductionRows.push({
        payrollItemId,
        deductionTypeId: line.deductionTypeId,
        amount: line.amount,
        category: line.category,
      });
    }
  });
  if (taxRows.length > 0) await tx.insert(payrollItemTaxBreakdown).values(taxRows);
  if (employerRows.length > 0) await tx.insert(payrollItemEmployerTax).values(employerRows);
  if (deductionRows.length > 0) await tx.insert(payrollItemDeduction).values(deductionRows);
}

/** Recalculate a run's header totals from its items. */
export async function recomputeRunTotals(tx: Tx, payrollRunId: string) {
  const items = await tx.query.payrollItem.findMany({
    where: eq(payrollItem.payrollRunId, payrollRunId),
    columns: { grossAmount: true, deductions: true, netAmount: true, fxRate: true },
  });
  const totals = sumRunTotals(items);
  const [run] = await tx
    .update(payrollRun)
    .set(totals)
    .where(eq(payrollRun.id, payrollRunId))
    .returning();
  return run;
}

/**
 * Recalculate one employee's item on a DRAFT run, e.g. after a bonus was added
 * or removed: the employee's regular pay (unless it's a bonus-only run) plus
 * every bonus recorded against the run for them, re-taxed together. Clears any
 * sign-off, since the figures changed.
 */
export async function rebuildDraftRunEmployee(
  tx: Tx,
  organizationId: string,
  run: typeof payrollRun.$inferSelect,
  employeeId: string
) {
  const emp = await tx.query.payrollEmployee.findFirst({
    where: and(
      eq(payrollEmployee.id, employeeId),
      eq(payrollEmployee.organizationId, organizationId),
      notDeleted(payrollEmployee.deletedAt)
    ),
  });
  if (!emp) throw new Error("Employee not found");

  const existing = await tx.query.payrollItem.findMany({
    where: and(eq(payrollItem.payrollRunId, run.id), eq(payrollItem.employeeId, employeeId)),
    columns: { id: true },
  });
  if (existing.length > 0) {
    await tx.delete(payrollItem).where(inArray(payrollItem.id, existing.map((e) => e.id)));
  }

  const bonuses = await tx.query.payrollBonus.findMany({
    where: and(eq(payrollBonus.payrollRunId, run.id), eq(payrollBonus.employeeId, employeeId)),
  });

  const bctx = await createRunBuildContext(organizationId, run.payPeriodStart, run.payPeriodEnd, [emp], tx);
  // Regular runs pay the employee's normal pay alongside the bonus, but only if
  // they were in the run before (an inactive employee only gets the bonus).
  const base = run.runType !== "bonus_only" && (existing.length > 0 || emp.isActive);
  const item = await buildEmployeePayItem(
    bctx,
    emp,
    {
      base,
      bonuses: bonuses.map((b) => ({ amount: b.amount, description: b.description || `${b.bonusType} bonus` })),
      applyDeductions: run.runType !== "bonus_only",
    },
    tx
  );
  if (item) await insertPayItems(tx, run.id, [item]);

  await tx
    .update(payrollRun)
    .set({ approvalStatus: null, approvedBy: null, approvedAt: null })
    .where(eq(payrollRun.id, run.id));
  return recomputeRunTotals(tx, run.id);
}
