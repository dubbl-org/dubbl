export type PeriodType = "monthly" | "weekly" | "daily" | "quarterly" | "yearly" | "custom";

export interface GeneratedPeriod {
  label: string;
  startDate: string;
  endDate: string;
  sortOrder: number;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function generatePeriods(
  periodType: PeriodType,
  startDate: string,
  endDate: string
): GeneratedPeriod[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  if (start > end) return [];

  switch (periodType) {
    case "daily":
      return generateDaily(start, end);
    case "weekly":
      return generateWeekly(start, end);
    case "monthly":
      return generateMonthly(start, end);
    case "quarterly":
      return generateQuarterly(start, end);
    case "yearly":
      return generateYearly(start, end);
    case "custom":
      return [{
        label: "Full Period",
        startDate: formatDate(start),
        endDate: formatDate(end),
        sortOrder: 0,
      }];
  }
}

function generateDaily(start: Date, end: Date): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  let current = new Date(start);
  let order = 0;
  while (current <= end) {
    periods.push({
      label: `${SHORT_MONTHS[current.getMonth()]} ${current.getDate()}, ${current.getFullYear()}`,
      startDate: formatDate(current),
      endDate: formatDate(current),
      sortOrder: order++,
    });
    current = addDays(current, 1);
  }
  return periods;
}

function generateWeekly(start: Date, end: Date): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  let current = new Date(start);
  let week = 1;
  while (current <= end) {
    const weekEnd = new Date(Math.min(addDays(current, 6).getTime(), end.getTime()));
    periods.push({
      label: `Week ${week}`,
      startDate: formatDate(current),
      endDate: formatDate(weekEnd),
      sortOrder: week - 1,
    });
    current = addDays(current, 7);
    week++;
  }
  return periods;
}

function generateMonthly(start: Date, end: Date): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  let order = 0;
  while (current <= end) {
    const monthStart = new Date(Math.max(current.getTime(), start.getTime()));
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const clampedEnd = new Date(Math.min(monthEnd.getTime(), end.getTime()));
    periods.push({
      label: `${SHORT_MONTHS[current.getMonth()]} ${current.getFullYear()}`,
      startDate: formatDate(monthStart),
      endDate: formatDate(clampedEnd),
      sortOrder: order++,
    });
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
  return periods;
}

function generateQuarterly(start: Date, end: Date): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  const startQuarter = Math.floor(start.getMonth() / 3);
  let year = start.getFullYear();
  let quarter = startQuarter;
  let order = 0;
  while (true) {
    const qStart = new Date(year, quarter * 3, 1);
    const qEnd = new Date(year, quarter * 3 + 3, 0);
    if (qStart > end) break;
    const clampedStart = new Date(Math.max(qStart.getTime(), start.getTime()));
    const clampedEnd = new Date(Math.min(qEnd.getTime(), end.getTime()));
    periods.push({
      label: `Q${quarter + 1} ${year}`,
      startDate: formatDate(clampedStart),
      endDate: formatDate(clampedEnd),
      sortOrder: order++,
    });
    quarter++;
    if (quarter > 3) {
      quarter = 0;
      year++;
    }
  }
  return periods;
}

function generateYearly(start: Date, end: Date): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  let year = start.getFullYear();
  let order = 0;
  while (true) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    if (yearStart > end) break;
    const clampedStart = new Date(Math.max(yearStart.getTime(), start.getTime()));
    const clampedEnd = new Date(Math.min(yearEnd.getTime(), end.getTime()));
    periods.push({
      label: `${year}`,
      startDate: formatDate(clampedStart),
      endDate: formatDate(clampedEnd),
      sortOrder: order++,
    });
    year++;
  }
  return periods;
}

export function distributeAmount(totalCents: number, periodCount: number): number[] {
  if (periodCount <= 0) return [];
  const perPeriod = Math.floor(totalCents / periodCount);
  const remainder = totalCents - perPeriod * periodCount;
  return Array.from({ length: periodCount }, (_, i) => perPeriod + (i < remainder ? 1 : 0));
}
