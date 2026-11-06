/**
 * Keeps employeeLeaveBalance rows (and payrollEmployee.ptoBalanceHours) in
 * step with the org's leave policies. Every active employee gets one row per
 * active policy per year, worked out from scratch each time:
 *
 *   balance = carried over from last year + accrued so far − approved leave
 *
 * capped at the policy's max balance. Accrual follows the policy's method (see
 * lib/payroll/leave-accrual.ts); "used" is the approved leave requests that
 * start in that year. Because it is recalculated rather than incremented, it
 * is safe to call as often as needed: on reading balances, after approving or
 * cancelling leave, and after finishing a pay run.
 */
import { db } from "@/lib/db";
import {
  employeeLeaveBalance,
  leavePolicy,
  leaveRequest,
  payrollEmployee,
  payrollItem,
  payrollRun,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { ApprovalError } from "@/lib/approvals/errors";
import {
  computeAccruedHours,
  computeCarryOver,
  computeLeaveBalance,
} from "@/lib/payroll/leave-accrual";

type DbOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Leave types that count towards an employee's "PTO" / time off left figure. */
const PTO_LEAVE_TYPES = new Set(["vacation", "personal"]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function syncLeaveBalances(
  organizationId: string,
  opts: { employeeIds?: string[]; year?: number } = {},
  exec: DbOrTx = db
): Promise<void> {
  const today = todayIso();
  const currentYear = Number(today.slice(0, 4));
  const year = opts.year ?? currentYear;
  const asOf = year < currentYear ? `${year}-12-31` : year > currentYear ? `${year}-01-01` : today;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const policies = await exec.query.leavePolicy.findMany({
    where: and(
      eq(leavePolicy.organizationId, organizationId),
      eq(leavePolicy.isActive, true),
      isNull(leavePolicy.deletedAt)
    ),
  });

  const empConditions = [
    eq(payrollEmployee.organizationId, organizationId),
    eq(payrollEmployee.isActive, true),
    notDeleted(payrollEmployee.deletedAt),
  ];
  if (opts.employeeIds) {
    if (opts.employeeIds.length === 0) return;
    empConditions.push(inArray(payrollEmployee.id, opts.employeeIds));
  }
  const employees = await exec.query.payrollEmployee.findMany({
    where: and(...empConditions),
    columns: { id: true, startDate: true, ptoBalanceHours: true },
  });
  if (employees.length === 0) return;
  const empIds = employees.map((e) => e.id);

  // Approved leave per employee + policy, by the year the leave starts in.
  const usedRows = await exec
    .select({
      employeeId: leaveRequest.employeeId,
      policyId: leaveRequest.policyId,
      hours: sql<number>`coalesce(sum(${leaveRequest.hours}), 0)`.mapWith(Number),
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.organizationId, organizationId),
        eq(leaveRequest.status, "approved"),
        inArray(leaveRequest.employeeId, empIds),
        gte(leaveRequest.startDate, yearStart),
        lte(leaveRequest.startDate, yearEnd)
      )
    )
    .groupBy(leaveRequest.employeeId, leaveRequest.policyId);
  const used = new Map(usedRows.map((r) => [`${r.employeeId}:${r.policyId}`, r.hours]));

  // Finished regular pay runs each employee was paid in, for per-pay-period accrual.
  const runRows = await exec
    .select({
      employeeId: payrollItem.employeeId,
      runs: sql<number>`count(distinct ${payrollRun.id})`.mapWith(Number),
    })
    .from(payrollItem)
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(
      and(
        eq(payrollRun.organizationId, organizationId),
        eq(payrollRun.status, "completed"),
        eq(payrollRun.runType, "regular"),
        isNull(payrollRun.deletedAt),
        inArray(payrollItem.employeeId, empIds),
        gte(payrollRun.payPeriodEnd, yearStart),
        lte(payrollRun.payPeriodEnd, asOf)
      )
    )
    .groupBy(payrollItem.employeeId);
  const runs = new Map(runRows.map((r) => [r.employeeId, r.runs]));

  const existing = await exec.query.employeeLeaveBalance.findMany({
    where: and(
      inArray(employeeLeaveBalance.employeeId, empIds),
      inArray(employeeLeaveBalance.year, [year - 1, year])
    ),
  });
  const rowFor = (employeeId: string, policyId: string, y: number) =>
    existing.find((r) => r.employeeId === employeeId && r.policyId === policyId && r.year === y);

  for (const emp of employees) {
    let pto = 0;
    for (const policy of policies) {
      const accrued = computeAccruedHours({
        method: policy.accrualMethod,
        rate: policy.accrualRate,
        year,
        asOf,
        startDate: emp.startDate,
        payRunsThisYear: runs.get(emp.id) ?? 0,
      });
      const usedHours = used.get(`${emp.id}:${policy.id}`) ?? 0;
      const prev = rowFor(emp.id, policy.id, year - 1);
      const carriedOver = prev ? computeCarryOver(prev.balance, policy.carryOverMax) : 0;
      const balance = computeLeaveBalance({ accrued, used: usedHours, carriedOver, maxBalance: policy.maxBalance });
      if (PTO_LEAVE_TYPES.has(policy.leaveType)) pto += balance;

      const row = rowFor(emp.id, policy.id, year);
      if (!row) {
        await exec.insert(employeeLeaveBalance).values({
          employeeId: emp.id,
          policyId: policy.id,
          year,
          balance,
          usedHours,
        });
      } else if (row.balance !== balance || row.usedHours !== usedHours) {
        await exec
          .update(employeeLeaveBalance)
          .set({ balance, usedHours, updatedAt: new Date() })
          .where(eq(employeeLeaveBalance.id, row.id));
      }
    }

    pto = Math.round(pto * 100) / 100;
    if (year === currentYear && emp.ptoBalanceHours !== pto) {
      await exec
        .update(payrollEmployee)
        .set({ ptoBalanceHours: pto, updatedAt: new Date() })
        .where(eq(payrollEmployee.id, emp.id));
    }
  }
}

/**
 * Check a new time-off request: the employee and policy belong to the org and
 * are active, the dates are in order and the hours are positive. Throws an
 * ApprovalError (a 400 with the message) when something is off.
 */
export async function assertValidLeaveRequest(
  organizationId: string,
  input: { employeeId: string; policyId: string; startDate: string; endDate: string; hours: number }
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new ApprovalError("Dates must be in YYYY-MM-DD format");
  }
  if (input.endDate < input.startDate) throw new ApprovalError("The last day can't be before the first day");
  if (!(input.hours > 0)) throw new ApprovalError("Enter how many hours off in total");

  const emp = await db.query.payrollEmployee.findFirst({
    where: and(
      eq(payrollEmployee.id, input.employeeId),
      eq(payrollEmployee.organizationId, organizationId),
      notDeleted(payrollEmployee.deletedAt)
    ),
    columns: { id: true },
  });
  if (!emp) throw new ApprovalError("Employee not found", 404);

  const policy = await db.query.leavePolicy.findFirst({
    where: and(
      eq(leavePolicy.id, input.policyId),
      eq(leavePolicy.organizationId, organizationId),
      eq(leavePolicy.isActive, true),
      isNull(leavePolicy.deletedAt)
    ),
    columns: { id: true },
  });
  if (!policy) throw new ApprovalError("Leave policy not found", 404);
}
