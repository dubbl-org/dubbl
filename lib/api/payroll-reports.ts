import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItem,
  payrollItemEmployerTax,
  payrollEmployee,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, type AnyColumn, type SQL } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Payroll reports shared by the REST routes and the MCP tools.
 *
 * Only finished runs count: void (cancelled) and deleted runs are left out. A
 * run belongs to the period its pay date (the end of the pay period) falls in.
 * Run totals are stored in the base currency; item amounts are in the
 * employee's currency and are converted at the item's fxRate. Note that
 * payrollItem.deductions and payrollRun.totalDeductions already include tax.
 */
export interface ReportRange {
  /** YYYY-MM-DD, inclusive, compared with the pay date. */
  startDate?: string | null;
  /** YYYY-MM-DD, inclusive, compared with the pay date. */
  endDate?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function finishedRuns(ctx: AuthContext, range: ReportRange = {}): SQL {
  const conditions: SQL[] = [
    eq(payrollRun.organizationId, ctx.organizationId),
    eq(payrollRun.status, "completed"),
    notDeleted(payrollRun.deletedAt),
  ];
  if (range.startDate && DATE_RE.test(range.startDate)) conditions.push(gte(payrollRun.payPeriodEnd, range.startDate));
  if (range.endDate && DATE_RE.test(range.endDate)) conditions.push(lte(payrollRun.payPeriodEnd, range.endDate));
  return and(...conditions)!;
}

/** sum(amount × item fxRate), rounded per item, as base-currency cents. */
const baseSum = (column: AnyColumn) =>
  sql<number>`coalesce(sum(round(${column} * coalesce(${payrollItem.fxRate}, 1))), 0)`.mapWith(Number);

/** Employer taxes (FICA match, FUTA, SUTA) of the matching runs per employee, base cents. */
async function employerTaxByEmployee(where: SQL): Promise<Map<string, number>> {
  const rows = await db
    .select({
      employeeId: payrollItem.employeeId,
      amount: sql<number>`coalesce(sum(round(${payrollItemEmployerTax.amount} * coalesce(${payrollItem.fxRate}, 1))), 0)`.mapWith(Number),
    })
    .from(payrollItemEmployerTax)
    .innerJoin(payrollItem, eq(payrollItemEmployerTax.payrollItemId, payrollItem.id))
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(where)
    .groupBy(payrollItem.employeeId);
  return new Map(rows.map((r) => [r.employeeId, r.amount]));
}

export async function getPayrollSummary(ctx: AuthContext, range: ReportRange = {}) {
  const where = finishedRuns(ctx, range);

  const [runs] = await db
    .select({
      totalRuns: sql<number>`count(*)`.mapWith(Number),
      totalGross: sql<number>`coalesce(sum(${payrollRun.totalGross}), 0)`.mapWith(Number),
      totalNet: sql<number>`coalesce(sum(${payrollRun.totalNet}), 0)`.mapWith(Number),
    })
    .from(payrollRun)
    .where(where);

  // Other deductions = deductions − tax per item, floored at 0 (older items
  // stored deductions without the tax)
  const [items] = await db
    .select({
      totalTax: baseSum(payrollItem.taxAmount),
      totalOtherDeductions: sql<number>`coalesce(sum(round(greatest(${payrollItem.deductions} - ${payrollItem.taxAmount}, 0) * coalesce(${payrollItem.fxRate}, 1))), 0)`.mapWith(Number),
    })
    .from(payrollItem)
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(where);

  const employerTaxes = [...(await employerTaxByEmployee(where)).values()].reduce((a, b) => a + b, 0);

  const [empCount] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(payrollEmployee)
    .where(and(
      eq(payrollEmployee.organizationId, ctx.organizationId),
      eq(payrollEmployee.isActive, true),
      notDeleted(payrollEmployee.deletedAt)
    ));

  const totalRuns = runs?.totalRuns ?? 0;
  const totalGross = runs?.totalGross ?? 0;
  const totalTax = items?.totalTax ?? 0;
  const totalOtherDeductions = items?.totalOtherDeductions ?? 0;

  return {
    totalRuns,
    totalGross,
    /** Employee tax withheld (income tax, Social Security, Medicare). */
    totalTax,
    /** Deductions other than tax (pension, benefits, garnishments, ...). */
    totalOtherDeductions,
    /** Tax plus other deductions. */
    totalDeductions: totalTax + totalOtherDeductions,
    totalNet: runs?.totalNet ?? 0,
    /** Employer-side taxes on top of gross pay. */
    employerTaxes,
    activeEmployees: empCount?.count ?? 0,
    avgCostPerRun: totalRuns > 0 ? Math.round(totalGross / totalRuns) : 0,
  };
}

export async function getTaxLiabilityReport(ctx: AuthContext, range: ReportRange = {}) {
  const where = finishedRuns(ctx, range);
  const rows = await db
    .select({
      employeeId: payrollItem.employeeId,
      employeeName: payrollEmployee.name,
      totalGross: baseSum(payrollItem.grossAmount),
      totalTax: baseSum(payrollItem.taxAmount),
    })
    .from(payrollItem)
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .innerJoin(payrollEmployee, eq(payrollItem.employeeId, payrollEmployee.id))
    .where(where)
    .groupBy(payrollItem.employeeId, payrollEmployee.name);

  const employerByEmployee = await employerTaxByEmployee(where);
  const data = rows.map((r) => ({ ...r, employerTax: employerByEmployee.get(r.employeeId) ?? 0 }));

  return {
    data,
    totalTax: data.reduce((s, r) => s + r.totalTax, 0),
    totalEmployerTax: data.reduce((s, r) => s + r.employerTax, 0),
  };
}

export async function getLaborCostReport(ctx: AuthContext, range: ReportRange = {}) {
  const data = await db
    .select({
      department: sql<string>`coalesce(${payrollEmployee.department}, 'Unassigned')`,
      totalGross: baseSum(payrollItem.grossAmount),
      totalNet: baseSum(payrollItem.netAmount),
      employeeCount: sql<number>`count(distinct ${payrollItem.employeeId})`.mapWith(Number),
    })
    .from(payrollItem)
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .innerJoin(payrollEmployee, eq(payrollItem.employeeId, payrollEmployee.id))
    .where(finishedRuns(ctx, range))
    .groupBy(payrollEmployee.department);
  return { data };
}

/**
 * Month by month (by pay date) within the range, each compared with the same
 * month a year earlier.
 */
export async function getYoyReport(ctx: AuthContext, range: ReportRange = {}) {
  const month = sql<string>`to_char(${payrollRun.payPeriodEnd}::date, 'YYYY-MM')`;
  const months = (where: SQL) =>
    db
      .select({
        month,
        totalGross: sql<number>`coalesce(sum(${payrollRun.totalGross}), 0)`.mapWith(Number),
        totalNet: sql<number>`coalesce(sum(${payrollRun.totalNet}), 0)`.mapWith(Number),
        runCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(payrollRun)
      .where(where)
      .groupBy(month)
      .orderBy(month);

  // Same date a year earlier (Feb 29 becomes Feb 28)
  const shiftYear = (d: string | null | undefined) =>
    d && DATE_RE.test(d) ? `${Number(d.slice(0, 4)) - 1}${d.slice(4) === "-02-29" ? "-02-28" : d.slice(4)}` : null;

  const current = await months(finishedRuns(ctx, range));
  const prior = await months(finishedRuns(ctx, { startDate: shiftYear(range.startDate), endDate: shiftYear(range.endDate) }));
  const priorByMonth = new Map(prior.map((p) => [p.month, p]));

  const data = current.map((m) => {
    const last = priorByMonth.get(`${Number(m.month.slice(0, 4)) - 1}${m.month.slice(4)}`);
    const priorYearGross = last?.totalGross ?? 0;
    return {
      ...m,
      priorYearGross,
      priorYearNet: last?.totalNet ?? 0,
      /** Gross change vs the same month last year, in percent; null when there was nothing then. */
      changePercent: priorYearGross > 0 ? Math.round(((m.totalGross - priorYearGross) / priorYearGross) * 1000) / 10 : null,
    };
  });
  return { data };
}

function csvCell(value: string): string {
  // Quote fields with separators/quotes, and neutralize spreadsheet formulas
  const v = /^[=+\-@]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * One row per employee per finished run. Amounts are in the employee's pay
 * currency. "Other Deductions" is deductions minus tax, floored at 0.
 */
export async function buildPayrollExportCsv(ctx: AuthContext, range: ReportRange = {}): Promise<string> {
  const runs = await db.query.payrollRun.findMany({
    where: finishedRuns(ctx, range),
    orderBy: (r, { asc }) => [asc(r.payPeriodEnd)],
    with: { items: { with: { employee: true } } },
  });

  const rows: string[] = ["Employee,Employee #,Period Start,Period End,Currency,Gross,Tax,Other Deductions,Net"];
  const money = (cents: number) => (cents / 100).toFixed(2);
  for (const run of runs) {
    for (const item of run.items) {
      rows.push([
        csvCell(item.employee?.name || ""),
        csvCell(item.employee?.employeeNumber || ""),
        run.payPeriodStart,
        run.payPeriodEnd,
        item.currency || "USD",
        money(item.grossAmount),
        money(item.taxAmount),
        money(Math.max(0, item.deductions - item.taxAmount)),
        money(item.netAmount),
      ].join(","));
    }
  }
  return rows.join("\n");
}
