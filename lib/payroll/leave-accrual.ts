/**
 * Leave (time off) accrual math. Pure: no DB access, so it is unit-testable.
 * All values are hours. Dates are YYYY-MM-DD strings.
 *
 * How each policy method builds up time off in a calendar year:
 *   per_pay_period  rate hours for every finished regular pay run the
 *                   employee was paid in that year.
 *   monthly         rate hours at the start of every month worked, from the
 *                   month the employee started.
 *   annually        rate hours a year, earned evenly day by day.
 *   front_loaded    the full rate available from the first day of the year
 *                   (or the start date, for someone who joined that year).
 */

export type AccrualMethod = "per_pay_period" | "monthly" | "annually" | "front_loaded";

export interface AccrualInput {
  method: AccrualMethod | string;
  /** Hours earned per period (pay run, month or year, depending on method). */
  rate: number;
  year: number;
  /** Count accrual up to and including this date. */
  asOf: string;
  /** Employee start date. */
  startDate: string;
  /** Finished regular pay runs this employee was paid in, this year, up to asOf. */
  payRunsThisYear?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(h: number): number {
  return Math.round(h * 100) / 100;
}

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Hours of leave accrued in `year`, counted up to `asOf`. Never negative. */
export function computeAccruedHours(input: AccrualInput): number {
  const rate = Math.max(0, input.rate);
  if (rate === 0) return 0;

  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year}-12-31`;
  const from = input.startDate > yearStart ? input.startDate : yearStart;
  const to = input.asOf < yearEnd ? input.asOf : yearEnd;
  if (from > yearEnd || from > to) return 0;

  switch (input.method) {
    case "front_loaded":
      return round2(rate);
    case "annually": {
      const daysInYear = days(yearStart, yearEnd) + 1;
      const worked = days(from, to) + 1;
      return round2((rate * worked) / daysInYear);
    }
    case "monthly": {
      // A month counts once its first day has arrived, starting with the
      // month the employee started in.
      const firstMonth = Number(from.slice(5, 7));
      const lastMonth = Number(to.slice(5, 7));
      const months = Math.max(0, lastMonth - firstMonth + 1);
      return round2(rate * months);
    }
    case "per_pay_period":
    default:
      return round2(rate * Math.max(0, input.payRunsThisYear ?? 0));
  }
}

export interface LeaveBalanceInput {
  accrued: number;
  used: number;
  /** Hours carried from last year (already capped by the policy). */
  carriedOver?: number;
  /** Most hours that can be banked; null = no cap. */
  maxBalance?: number | null;
}

/** Hours still available: carried over + accrued − used, capped at the policy maximum. */
export function computeLeaveBalance(input: LeaveBalanceInput): number {
  let available = (input.carriedOver ?? 0) + input.accrued - input.used;
  if (input.maxBalance != null && input.maxBalance >= 0) {
    available = Math.min(available, input.maxBalance);
  }
  return round2(available);
}

/** Hours that roll into next year: the remaining balance, capped by the policy's carry-over limit. */
export function computeCarryOver(remaining: number, carryOverMax: number | null | undefined): number {
  const left = Math.max(0, remaining);
  if (carryOverMax == null) return round2(left);
  return round2(Math.min(left, Math.max(0, carryOverMax)));
}
