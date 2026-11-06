// Pure project rules shared by the API routes, the MCP tools and the project
// pages. No database access here so it can be unit tested and used client-side.

export type ProjectRole = "manager" | "contributor" | "viewer";

/**
 * What someone may do on a project:
 * - view: read only
 * - contribute: tasks, checklists, comments, time entries, timers and notes
 * - manage: everything, including settings, members, milestones and invoicing
 */
export type ProjectAccess = "view" | "contribute" | "manage";

const ACCESS_RANK: Record<ProjectAccess, number> = { view: 0, contribute: 1, manage: 2 };

export function accessAtLeast(access: ProjectAccess, needed: ProjectAccess): boolean {
  return ACCESS_RANK[access] >= ACCESS_RANK[needed];
}

/**
 * Org owners and admins always manage. Everyone else needs the org permission
 * `manage:projects` to change anything; on top of that their project role
 * applies. People who are not on the project contribute, and may manage while
 * the project has no manager (so a new project is never locked).
 */
export function resolveProjectAccess(input: {
  orgRole: string;
  canManageProjects: boolean;
  projectRole: ProjectRole | null;
  projectHasManager: boolean;
}): ProjectAccess {
  if (input.orgRole === "owner" || input.orgRole === "admin") return "manage";
  if (!input.canManageProjects) return "view";
  if (input.projectRole === "manager") return "manage";
  if (input.projectRole === "contributor") return "contribute";
  if (input.projectRole === "viewer") return "view";
  return input.projectHasManager ? "contribute" : "manage";
}

/** Value of a time entry in cents: hours worked times the hourly rate (cents). */
export function timeEntryAmount(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate);
}

interface EntryLike {
  minutes: number;
  hourlyRate: number;
  isBillable: boolean;
  invoiceId: string | null;
}

/**
 * Money side of a set of time entries. Only billable entries earn revenue;
 * non-billable time counts toward hours but never toward money.
 * avgRate is cents per hour over billable time (0 when there is none).
 */
export function summarizeTimeEntries(entries: EntryLike[]) {
  let totalMinutes = 0;
  let billableMinutes = 0;
  let billableAmount = 0;
  let unbilledMinutes = 0;
  let unbilledAmount = 0;
  for (const e of entries) {
    totalMinutes += e.minutes;
    if (!e.isBillable) continue;
    const amount = timeEntryAmount(e.minutes, e.hourlyRate);
    billableMinutes += e.minutes;
    billableAmount += amount;
    if (!e.invoiceId) {
      unbilledMinutes += e.minutes;
      unbilledAmount += amount;
    }
  }
  const avgRate = billableMinutes > 0 ? Math.round(billableAmount / (billableMinutes / 60)) : 0;
  return { totalMinutes, billableMinutes, billableAmount, unbilledMinutes, unbilledAmount, avgRate };
}

/**
 * Amount (cents) of a fixed-price progress invoice for `percent` of the fixed
 * price, never more than what is left to invoice.
 */
export function fixedPriceInvoiceAmount(fixedPrice: number, alreadyInvoiced: number, percent: number): number {
  const pct = Math.min(100, Math.max(0, percent));
  const remaining = Math.max(0, fixedPrice - alreadyInvoiced);
  return Math.min(remaining, Math.round((fixedPrice * pct) / 100));
}

/** YYYY-MM-DD for a date in the viewer's local time zone (not UTC). */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when a YYYY-MM-DD due date is before `today` (also YYYY-MM-DD, local). */
export function isPastDue(dueDate: string | null | undefined, today: string = localISODate()): boolean {
  return !!dueDate && dueDate < today;
}

/** Monday to Sunday of the week containing `ref`, as local YYYY-MM-DD dates. */
export function localWeekDates(ref: Date = new Date()): string[] {
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localISODate(d);
  });
}

interface EntryState {
  userId: string;
  invoiceId: string | null;
  date: string;
  minutes: number;
  isBillable: boolean;
  hourlyRate: number;
}

/** Entry fields an invoice was built from; locked while the entry is invoiced. */
const INVOICED_LOCKED_FIELDS = ["date", "minutes", "isBillable", "hourlyRate"] as const;

/**
 * Why a time entry change is not allowed (message + HTTP status), or null. People without
 * manage access can only change their own time. Invoiced time can't be deleted
 * and only its description and task can change, until the invoice is voided or
 * deleted (which releases the entry).
 */
export function timeEntryChangeError(
  entry: EntryState,
  change: Partial<Omit<EntryState, "userId" | "invoiceId">> | "delete",
  who: { userId: string; access: ProjectAccess }
): { message: string; status: 403 | 409 } | null {
  if (who.access !== "manage" && entry.userId !== who.userId) {
    return { message: "You can only change your own time entries", status: 403 };
  }
  if (!entry.invoiceId) return null;
  if (change === "delete") {
    return { message: "This time is on an invoice. Void or delete the invoice first.", status: 409 };
  }
  const touched = INVOICED_LOCKED_FIELDS.some(
    (f) => change[f] !== undefined && change[f] !== entry[f]
  );
  return touched
    ? {
        message:
          "This time is on an invoice, so only its description and task can change. Void or delete the invoice first.",
        status: 409,
      }
    : null;
}

/**
 * The income account for every line of a project invoice: the client's default
 * income account (Contacts > Bookkeeping) when set, else the organization's
 * Sales account. Null when neither exists. Every line needs one, or sending
 * the invoice posts no income and no receivable.
 */
export function projectInvoiceRevenueAccount(
  contactRevenueAccountId: string | null | undefined,
  salesAccountId: string | null | undefined
): string | null {
  return contactRevenueAccountId || salesAccountId || null;
}

/** Give every line the account (time, milestone, fixed and expense lines alike). */
export function withLineAccount<L extends object>(lines: L[], accountId: string): (L & { accountId: string })[] {
  return lines.map((l) => ({ ...l, accountId }));
}
