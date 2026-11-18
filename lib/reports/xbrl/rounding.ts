/**
 * Rounding for the XBRL boundary.
 *
 * ACRA filings are in whole dollars (`decimals="0"`), so every figure is
 * converted once, from cents, and every total is a sum of those converted
 * figures. Rounding a total independently makes it differ from its components
 * by ±1 and BizFinx rejects the sum.
 */

/**
 * Cents -> whole dollars. Symmetric around zero: `Math.round` alone maps -2.5
 * to -2 and 2.5 to 3, so an asset and its negative counterpart could round to
 * different magnitudes and break the balance-sheet identity.
 */
export function wholeDollars(cents: number): number {
  return Math.sign(cents) * Math.round(Math.abs(cents) / 100);
}

/** Sum of figures already in dollars. Never round the total afterwards. */
export function sumWholeDollars(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
