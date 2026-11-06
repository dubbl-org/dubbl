/**
 * Pure date/amount math for revenue schedules (no DB access, unit-tested).
 * All amounts are integer cents; dates are "YYYY-MM-DD" strings.
 */

export type RevenueMethod = "straight_line" | "milestone" | "on_completion";

export interface RevenuePeriod {
  periodDate: string;
  amount: number;
  sortOrder: number;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  return [y, m, d];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add whole months to a date, clamping the day to the target month's length
 * (Jan 31 + 1 month = Feb 28/29, never Mar 3). Timezone-independent.
 */
export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Number of calendar months from start to end, inclusive (minimum 1). */
export function monthsInclusive(startDate: string, endDate: string): number {
  const [sy, sm] = parts(startDate);
  const [ey, em] = parts(endDate);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

/**
 * The periods a schedule recognizes:
 * - straight_line: one period per month from startDate to endDate, split evenly
 *   with the rounding remainder on the last period.
 * - milestone: the same even split, but each period is counted by hand when the
 *   milestone is reached (the daily job never counts these).
 * - on_completion: a single period for the full amount on endDate.
 */
export function buildRevenuePeriods(
  totalAmount: number,
  startDate: string,
  endDate: string,
  method: RevenueMethod
): RevenuePeriod[] {
  if (method === "on_completion") {
    return [{ periodDate: endDate, amount: totalAmount, sortOrder: 0 }];
  }
  const periods = monthsInclusive(startDate, endDate);
  const perPeriod = Math.floor(totalAmount / periods);
  const out: RevenuePeriod[] = [];
  for (let i = 0; i < periods; i++) {
    out.push({
      periodDate: addMonthsClamped(startDate, i),
      amount: i === periods - 1 ? totalAmount - perPeriod * (periods - 1) : perPeriod,
      sortOrder: i,
    });
  }
  return out;
}

/** Whether the daily job may count this schedule's due periods by itself. */
export function autoRecognizes(method: string): boolean {
  return method !== "milestone";
}

/**
 * How much income has to be moved into deferred revenue so the books match the
 * schedule. Periods marked counted WITH a journal entry already took their
 * share out of deferred revenue, so they're part of the deferral; periods
 * marked counted WITHOUT one (older data) never posted, so their share stays
 * in income.
 */
export function deferralAmount(
  totalAmount: number,
  entries: { amount: number; recognized: boolean; journalEntryId: string | null }[]
): number {
  const countedWithoutEntry = entries
    .filter((e) => e.recognized && !e.journalEntryId)
    .reduce((s, e) => s + e.amount, 0);
  return Math.max(0, totalAmount - countedWithoutEntry);
}

/**
 * The date a period is counted on: its own date, but never before the invoice
 * (the income can't leave deferred revenue before it got there) and never in
 * the future (counting early books it today).
 */
export function recognitionDate(periodDate: string, invoiceDate: string, today: string): string {
  const d = periodDate < invoiceDate ? invoiceDate : periodDate;
  return d > today ? today : d;
}
