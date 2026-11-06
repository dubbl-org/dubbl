/**
 * Pure date helpers for recurring templates. Kept free of DB imports so they
 * can be unit-tested and shared by the scheduler, the REST routes and MCP.
 */

/**
 * Advance a date by the given frequency.
 */
export function advanceDate(date: string, frequency: string): string {
  const d = new Date(date + "T00:00:00Z");
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "fortnightly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "semi_annual":
      d.setUTCMonth(d.getUTCMonth() + 6);
      break;
    case "annual":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().split("T")[0];
}

/**
 * Where a paused schedule picks up when it's resumed. Dates missed while it
 * was paused are skipped, not back-filled: the next run moves forward along
 * the schedule to the first date on or after `today`. If that lands past the
 * end date, the schedule is finished.
 */
export function resumeSchedule(
  tmpl: { nextRunDate: string; frequency: string; endDate: string | null },
  today: string
): { nextRunDate: string; status: "active" | "completed" } {
  let next = tmpl.nextRunDate;
  while (next < today) next = advanceDate(next, tmpl.frequency);
  const pastEnd = tmpl.endDate !== null && next > tmpl.endDate;
  return { nextRunDate: next, status: pastEnd ? "completed" : "active" };
}
