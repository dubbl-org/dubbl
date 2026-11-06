/**
 * The first day of the financial year that contains a date. Pure, so it is
 * unit tested and shared by the reports that open the ledger "from the start
 * of the year" (trial balance and balance sheet click-throughs).
 *
 * A fiscal year set up under Accounting > Fiscal years wins when one contains
 * the date (it may be a short or long first year). Otherwise the year starts
 * on the 1st of the organization's fiscal year start month (1 = January).
 */
export function fiscalYearStartFor(
  date: string,
  startMonth: number | null | undefined,
  fiscalYears: { startDate: string; endDate: string }[] = []
): string {
  const day = date.slice(0, 10);
  const match = fiscalYears
    .filter((fy) => fy.startDate <= day && fy.endDate >= day)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (match) return match.startDate;

  const m = startMonth && startMonth >= 1 && startMonth <= 12 ? Math.trunc(startMonth) : 1;
  const y = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const year = month >= m ? y : y - 1;
  return `${year}-${String(m).padStart(2, "0")}-01`;
}
