/**
 * Singapore filing calendar: the tax_period rows a fiscal year contains.
 *
 * A Singapore company files GST every month or quarter, an ECI within three
 * months of its financial year end, and Form C-S by 30 November of the year
 * after the financial year ends. This module turns an organisation's filing
 * settings plus one fiscal year into the rows to insert into `tax_period`.
 *
 * `generatePeriods` is a pure function of its input: same organisation, same
 * fiscal year, same rows. It also drops any row whose (returnKind, startDate,
 * endDate) key repeats, so calling it twice and inserting both results with
 * `onConflictDoNothing` leaves one row per period (the unique index
 * tax_period_org_kind_dates_idx matches that key).
 *
 * All dates are plain ISO `YYYY-MM-DD` and handled in UTC so the output does not
 * depend on the server's time zone.
 */
const IRAS = "IRAS";

/** GST returns are due one month after the end of the accounting period. */
const GST_DUE_DAYS = 30;
/** ECI is due three months after the financial year end. */
const ECI_DUE_DAYS = 90;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** The organisation fields the calendar reads (a subset of the DB row). */
export interface PeriodOrg {
  /** 1–12: the month the fiscal year starts. 1 = calendar year. */
  fiscalYearStartMonth?: number | null;
  /** Date GST registration took effect. No date = not GST registered. */
  gstRegisteredAt?: string | null;
  /** Last day of GST registration; periods stop here when set. */
  gstDeregisteredAt?: string | null;
  /** "monthly" | "quarterly" (the default when unset is quarterly). */
  gstFilingFrequency?: string | null;
  /** 1–12: the month the GST accounting period starts. */
  gstPeriodStartMonth?: number | null;
}

export interface GeneratedPeriod {
  /** Human label, e.g. "GST Q3 2026", "ECI FY2026". */
  name: string;
  startDate: string;
  endDate: string;
  /** Matches the tax_period_type enum. */
  type: "monthly" | "quarterly" | "annual";
  returnKind: string;
  authority: string;
  /**
   * Statutory filing deadline. `tax_period` has no column for it; the calendar
   * derives it from the period end, so it is carried here for display and tests.
   */
  dueDate: string;
}

// ── UTC date helpers ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Absolute month index (year * 12 + 0-based month) — safe for modulo maths. */
function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

function monthStart(index: number): Date {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

function monthEnd(index: number): Date {
  return new Date(Date.UTC(Math.floor(index / 12), (index % 12) + 1, 0));
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by;
}

// ── Fiscal year ──────────────────────────────────────────────────────────────

export interface FiscalYear {
  startDate: string;
  endDate: string;
}

/**
 * The fiscal year that ENDS in `fiscalYear`, so FY2026 with a December year end
 * is 2026-01-01…2026-12-31 and with a June year end is 2025-07-01…2026-06-30.
 */
export function fiscalYearRange(org: PeriodOrg, fiscalYear: number): FiscalYear {
  const startMonth = clampMonth(org.fiscalYearStartMonth ?? 1);
  const endMonth0 = startMonth === 1 ? 11 : startMonth - 2;
  const endIndex = monthIndex(fiscalYear, endMonth0);
  return {
    startDate: toIso(monthStart(endIndex - 11)),
    endDate: toIso(monthEnd(endIndex)),
  };
}

function clampMonth(month: number): number {
  if (!Number.isFinite(month)) return 1;
  return Math.min(12, Math.max(1, Math.round(month)));
}

/**
 * Form C-S is due 30 November of the year after the financial year end, which is
 * the year of assessment (a 31 Dec 2026 year end → 30 Nov 2027).
 */
export function formCsDueDate(fiscalYearEnd: string): string {
  const year = parseIso(fiscalYearEnd).getUTCFullYear();
  return toIso(new Date(Date.UTC(year + 1, 10, 30)));
}

// ── GST periods ──────────────────────────────────────────────────────────────

function gstFrequency(org: PeriodOrg): { type: "monthly" | "quarterly"; months: 1 | 3 } {
  return org.gstFilingFrequency === "monthly"
    ? { type: "monthly", months: 1 }
    : { type: "quarterly", months: 3 };
}

/**
 * GST accounting periods inside `range`, anchored on `gstPeriodStartMonth` (IRAS
 * assigns the anchor; it is the month registration first took effect by default).
 * The first period starts at registration and the last ends at deregistration or
 * the fiscal year end, whichever comes first.
 */
function gstPeriods(
  org: PeriodOrg,
  fy: FiscalYear
): GeneratedPeriod[] {
  if (!org.gstRegisteredAt) return [];
  const registered = parseIso(org.gstRegisteredAt);
  const deregistered = org.gstDeregisteredAt ? parseIso(org.gstDeregisteredAt) : null;
  const fyStart = parseIso(fy.startDate);
  const fyEnd = parseIso(fy.endDate);

  const rangeStart = registered > fyStart ? registered : fyStart;
  const hardEnd = deregistered && deregistered < fyEnd ? deregistered : fyEnd;
  if (rangeStart > hardEnd) return [];

  const { type, months } = gstFrequency(org);
  const anchorMonth0 = clampMonth(org.gstPeriodStartMonth ?? registered.getUTCMonth() + 1) - 1;
  const anchor = anchorMonth0; // month-of-year is enough: the grid repeats yearly
  const startIndex = monthIndex(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth());
  const endIndex = monthIndex(hardEnd.getUTCFullYear(), hardEnd.getUTCMonth());
  const firstIndex = startIndex - mod(startIndex - anchor, months);

  const rows: GeneratedPeriod[] = [];
  for (let index = firstIndex; index <= endIndex; index += months) {
    const periodStart = monthStart(index) < rangeStart ? rangeStart : monthStart(index);
    const gridEnd = monthEnd(index + months - 1);
    const periodEnd = gridEnd > hardEnd ? hardEnd : gridEnd;
    if (periodStart > periodEnd) continue;
    rows.push({
      name:
        type === "quarterly"
          ? `GST Q${Math.floor((index % 12) / 3) + 1} ${Math.floor(index / 12)}`
          : `GST ${MONTH_LABELS[index % 12]} ${Math.floor(index / 12)}`,
      startDate: toIso(periodStart),
      endDate: toIso(periodEnd),
      type,
      returnKind: "gst_f5",
      authority: IRAS,
      dueDate: toIso(addDays(periodEnd, GST_DUE_DAYS)),
    });
  }
  return rows;
}

// ── The year's calendar ──────────────────────────────────────────────────────

/**
 * The tax_period rows for one fiscal year: GST periods, one ECI period and one
 * Form C-S period. The annual rows carry the fiscal year as their date range —
 * the ECI and the C-S both report that year — and their deadline in `dueDate`.
 */
export function generatePeriods(
  org: PeriodOrg,
  fiscalYear: number
): GeneratedPeriod[] {
  const fy = fiscalYearRange(org, fiscalYear);
  const rows: GeneratedPeriod[] = [
    ...gstPeriods(org, fy),
    {
      name: `ECI FY${fiscalYear}`,
      startDate: fy.startDate,
      endDate: fy.endDate,
      type: "annual",
      returnKind: "eci",
      authority: IRAS,
      dueDate: toIso(addDays(parseIso(fy.endDate), ECI_DUE_DAYS)),
    },
    {
      name: `Form C-S FY${fiscalYear}`,
      startDate: fy.startDate,
      endDate: fy.endDate,
      type: "annual",
      returnKind: "form_c_s",
      authority: IRAS,
      dueDate: formCsDueDate(fy.endDate),
    },
  ];

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.returnKind}|${row.startDate}|${row.endDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
