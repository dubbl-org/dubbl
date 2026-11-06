/**
 * Overtime detection and shift premium calculation.
 * All monetary values are integer cents.
 */

interface OvertimeResult {
  regularHours: number;
  overtimeHours: number;
  regularAmount: number; // cents
  overtimeAmount: number; // cents
  totalAmount: number; // cents
}

/** Calculate overtime based on hours and threshold */
export function calculateOvertime(params: {
  totalHours: number;
  hourlyRate: number; // cents
  thresholdHours: number;
  overtimeMultiplier: number;
}): OvertimeResult {
  const { totalHours, hourlyRate, thresholdHours, overtimeMultiplier } = params;

  const regularHours = Math.min(totalHours, thresholdHours);
  const overtimeHours = Math.max(0, totalHours - thresholdHours);

  const regularAmount = Math.round(regularHours * hourlyRate);
  const overtimeAmount = Math.round(overtimeHours * hourlyRate * overtimeMultiplier);

  return {
    regularHours,
    overtimeHours,
    regularAmount,
    overtimeAmount,
    totalAmount: regularAmount + overtimeAmount,
  };
}

/** Calculate shift premium on top of base amount */
export function calculateShiftPremium(
  baseAmount: number, // cents
  premiumPercent: number
): number {
  return Math.round(baseAmount * (premiumPercent / 100));
}

/** Detect if weekly hours exceed threshold for a set of daily entries */
export function detectWeeklyOvertime(
  dailyHours: { date: string; hours: number }[],
  weeklyThreshold: number
): { week: string; totalHours: number; overtimeHours: number }[] {
  // Group by ISO week
  const weeks = new Map<string, number>();

  for (const entry of dailyHours) {
    const d = new Date(entry.date);
    // Get Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const weekKey = monday.toISOString().split("T")[0];

    weeks.set(weekKey, (weeks.get(weekKey) || 0) + entry.hours);
  }

  return Array.from(weeks.entries()).map(([week, totalHours]) => ({
    week,
    totalHours,
    overtimeHours: Math.max(0, totalHours - weeklyThreshold),
  }));
}

// ─── Hourly pay for one pay period ──────────────────────────────────

/** One timesheet line feeding a pay run. */
export interface TimesheetHoursEntry {
  date: string; // YYYY-MM-DD
  hours: number;
  shiftType?: string | null; // regular | overtime | night | weekend | holiday
}

export interface HourlyPayInput {
  hourlyRate: number; // cents
  entries: TimesheetHoursEntry[];
  periodStart: string; // YYYY-MM-DD, inclusive
  periodEnd: string; // YYYY-MM-DD, inclusive
  /** Overtime starts after this many hours in a week. 0 or less turns weekly overtime off. */
  weeklyThresholdHours: number;
  overtimeMultiplier: number;
  /** Extra % paid on top of the base rate for an hour of this shift type, e.g. { night: 15 }. */
  shiftPremiums?: Partial<Record<string, number>>;
}

export interface HourlyPayResult {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  regularAmount: number; // cents
  overtimeAmount: number; // cents
  premiumHours: number;
  premiumAmount: number; // cents
  grossAmount: number; // cents
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function roundHours(h: number): number {
  return Math.round(h * 100) / 100;
}

/**
 * Work out an hourly employee's pay for one pay period from timesheet lines.
 *
 * - Only lines dated inside the pay period count (a timesheet that straddles two
 *   periods is split between them).
 * - Overtime is weekly: the period is cut into 7-day weeks starting on the
 *   period start, and hours above the threshold within a week are overtime.
 * - Lines marked as an "overtime" shift are always overtime and don't use up
 *   the week's regular hours.
 * - Night, weekend and holiday lines earn the shift premium on top of the base
 *   rate for those hours.
 */
export function computeHourlyPay(input: HourlyPayInput): HourlyPayResult {
  const rate = Math.max(0, input.hourlyRate);
  const multiplier = input.overtimeMultiplier > 0 ? input.overtimeMultiplier : 1;
  const threshold = input.weeklyThresholdHours;

  const inPeriod = input.entries
    .filter((e) => e.date >= input.periodStart && e.date <= input.periodEnd && e.hours > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekHours = new Map<number, number>();
  let totalHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let premiumHours = 0;
  let premiumAmount = 0;

  for (const e of inPeriod) {
    totalHours += e.hours;
    const shift = e.shiftType ?? "regular";

    if (shift === "overtime") {
      overtimeHours += e.hours;
    } else if (threshold > 0) {
      const week = Math.floor(dayIndex(input.periodStart, e.date) / 7);
      const used = weekHours.get(week) ?? 0;
      const room = Math.max(0, threshold - used);
      const regular = Math.min(room, e.hours);
      regularHours += regular;
      overtimeHours += e.hours - regular;
      weekHours.set(week, used + e.hours);
    } else {
      regularHours += e.hours;
    }

    const premiumPct = input.shiftPremiums?.[shift] ?? 0;
    if (premiumPct > 0 && shift !== "regular" && shift !== "overtime") {
      premiumHours += e.hours;
      premiumAmount += Math.round((e.hours * rate * premiumPct) / 100);
    }
  }

  const regularAmount = Math.round(regularHours * rate);
  const overtimeAmount = Math.round(overtimeHours * rate * multiplier);

  return {
    totalHours: roundHours(totalHours),
    regularHours: roundHours(regularHours),
    overtimeHours: roundHours(overtimeHours),
    regularAmount,
    overtimeAmount,
    premiumHours: roundHours(premiumHours),
    premiumAmount,
    grossAmount: regularAmount + overtimeAmount + premiumAmount,
  };
}

/**
 * Standard hours in one pay period for an hourly employee with no approved
 * timesheet: 40 hours a week (2,080 a year) spread over the pay frequency.
 * These are always regular hours, never overtime.
 */
export function standardPeriodHours(payFrequency: string): number {
  switch (payFrequency) {
    case "weekly":
      return 40;
    case "biweekly":
      return 80;
    case "monthly":
    default:
      return roundHours(2080 / 12);
  }
}

/**
 * Hours of approved leave that fall inside a pay period. A request that spans
 * several periods is split by calendar days, so each period only counts its
 * share of the hours.
 */
export function leaveHoursInPeriod(
  requests: { startDate: string; endDate: string; hours: number }[],
  periodStart: string,
  periodEnd: string
): number {
  let total = 0;
  for (const r of requests) {
    if (r.hours <= 0 || r.endDate < periodStart || r.startDate > periodEnd) continue;
    const spanDays = Math.max(1, dayIndex(r.startDate, r.endDate) + 1);
    const from = r.startDate > periodStart ? r.startDate : periodStart;
    const to = r.endDate < periodEnd ? r.endDate : periodEnd;
    const overlapDays = Math.max(0, dayIndex(from, to) + 1);
    total += (r.hours * overlapDays) / spanDays;
  }
  return roundHours(total);
}
