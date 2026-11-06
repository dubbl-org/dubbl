/**
 * When a report schedule runs next. Pure, so it is unit tested and shared by
 * the schedule processor, the REST route and the MCP tools.
 */

export type ScheduleFrequency = "daily" | "weekly" | "monthly" | "quarterly";

/** `from` moved forward by `steps` periods of the frequency. */
function advance(frequency: ScheduleFrequency, from: Date, steps: number): Date {
  const next = new Date(from);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + steps);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * steps);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + steps);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3 * steps);
      break;
  }
  return next;
}

/** One period after `from`. */
export function calculateNextRunAt(frequency: ScheduleFrequency, from: Date): Date {
  return advance(frequency, from, 1);
}

/**
 * The next send time after `now` when a paused schedule is turned back on.
 * A send time still in the future is kept. One that passed while the schedule
 * was paused moves forward by whole periods (keeping its day and time) to the
 * first occurrence after `now`, so resuming never sends straight away. With no
 * send time on record, it is one period from `now`.
 */
export function nextRunAfterResume(
  frequency: ScheduleFrequency,
  nextRunAt: Date | string | null | undefined,
  now: Date = new Date()
): Date {
  if (!nextRunAt) return calculateNextRunAt(frequency, now);
  const base = new Date(nextRunAt);
  if (Number.isNaN(base.getTime())) return calculateNextRunAt(frequency, now);
  if (base.getTime() > now.getTime()) return base;
  // Step from the original time each time so month lengths don't drift the day.
  for (let steps = 1; steps < 100000; steps++) {
    const candidate = advance(frequency, base, steps);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return calculateNextRunAt(frequency, now);
}
