/**
 * Which list group a scheduled payment belongs to on the Scheduled Payments
 * page. Only payments still waiting to go out are grouped by date (overdue,
 * today, this week, ...). Finished ones go in their own group by status, so a
 * payment that was made last month shows under "Completed", not "Overdue".
 */
export type ScheduledPaymentStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export const SCHEDULED_PAYMENT_GROUP_ORDER = [
  "Overdue",
  "Failed",
  "Today",
  "This Week",
  "Next Week",
  "This Month",
  "Later",
  "Completed",
  "Cancelled",
] as const;

export type ScheduledPaymentGroup = (typeof SCHEDULED_PAYMENT_GROUP_ORDER)[number];

/** `today` is a local YYYY-MM-DD date. */
export function scheduledPaymentGroup(
  status: ScheduledPaymentStatus,
  scheduledDate: string,
  today: string
): ScheduledPaymentGroup {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";

  // pending / processing: by how far away the date is.
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const diff = Math.round((day(scheduledDate) - day(today)) / 86_400_000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff <= 7) return "This Week";
  if (diff <= 14) return "Next Week";
  if (diff <= 30) return "This Month";
  return "Later";
}
