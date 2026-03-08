/**
 * Calculate simple interest.
 * @param principalCents - principal amount in cents
 * @param rateBasisPoints - annual rate in basis points (500 = 5%)
 * @param days - number of days overdue
 * @returns interest amount in cents
 */
export function calculateSimpleInterest(
  principalCents: number,
  rateBasisPoints: number,
  days: number
): number {
  const annualRate = rateBasisPoints / 10000;
  return Math.round(principalCents * annualRate * (days / 365));
}

/**
 * Calculate compound interest (daily compounding).
 * @param principalCents - principal amount in cents
 * @param rateBasisPoints - annual rate in basis points
 * @param days - number of days overdue
 * @returns interest amount in cents
 */
export function calculateCompoundInterest(
  principalCents: number,
  rateBasisPoints: number,
  days: number
): number {
  const dailyRate = rateBasisPoints / 10000 / 365;
  const total = principalCents * Math.pow(1 + dailyRate, days);
  return Math.round(total - principalCents);
}
