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
