/**
 * When a tax return for a period is due, from the period's end date and the
 * organization's country. Pure, so the tax periods list, its API and the MCP
 * tools all show the same date.
 *
 * - UK (GB) VAT: one calendar month and seven days after the period ends.
 * - Australia (AU) BAS: monthly returns on the 21st of the next month;
 *   quarterly returns on the 28th of the month after the quarter, except the
 *   December quarter, due 28 February; annual returns on 28 February.
 * - United States (US) sales tax: the 20th of the month after the period.
 * - Anywhere else: the last day of the month after the period ends.
 */

function parseDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  // m is 1-based and may overflow; Date.UTC normalises it.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function filingDeadline(
  endDate: string,
  country: string | null | undefined,
  type: string | null | undefined
): string {
  const { y, m, d } = parseDate(endDate);
  const c = (country ?? "").toUpperCase();

  if (c === "GB" || c === "UK") {
    // One month after the end date (clamped to the month's length), plus 7 days.
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const day = Math.min(d, lastDayOfMonth(ny, nm));
    return toIso(ny, nm, day + 7);
  }

  if (c === "AU") {
    if (type === "monthly") return toIso(y, m + 1, 21);
    if (type === "annual") return toIso(m <= 2 ? y : y + 1, 2, 28);
    // Quarterly: December quarter is due 28 February.
    if (m === 12) return toIso(y + 1, 2, 28);
    return toIso(y, m + 1, 28);
  }

  if (c === "US") return toIso(y, m + 1, 20);

  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return toIso(ny, nm, lastDayOfMonth(ny, nm));
}
