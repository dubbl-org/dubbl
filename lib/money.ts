/**
 * Integer-based money utilities.
 * All amounts are stored as integer minor units (e.g. $12.50 = 1250).
 * The number of minor units depends on the currency — most have 2, but
 * JPY/KRW have 0 and KWD/BHD/OMR have 3, so display scales per currency.
 */
import { getCurrencyMinorUnits } from "@/lib/currency/iso4217";

/** Convert integer cents to a decimal string (e.g. 1250 → "12.50") */
export function centsToDecimal(cents: number, decimals = 2): string {
  return (cents / Math.pow(10, decimals)).toFixed(decimals);
}

/** Convert a decimal string or number to integer cents (e.g. "12.50" → 1250) */
export function decimalToCents(value: string | number, decimals = 2): number {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return 0;
  return Math.round(num * Math.pow(10, decimals));
}

/**
 * Format an integer minor-unit amount as a currency string.
 * Scales and sets fraction digits by the currency's real minor units, so
 * 1250 → "$12.50" (USD), 1250 → "¥1,250" (JPY), 1250 → "KWD 1.250" (KWD).
 */
export function formatMoney(
  cents: number,
  currency = "USD",
  locale = "en-US"
): string {
  const minorUnits = getCurrencyMinorUnits(currency);
  const amount = cents / Math.pow(10, minorUnits);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(amount);
}

/** Parse a user-entered money string to cents (strips symbols/commas) */
export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  return decimalToCents(cleaned);
}

/** Calculate tax amount in cents from a pre-tax amount in cents */
export function calculateTax(amountCents: number, ratePercent: number): number {
  return Math.round(amountCents * (ratePercent / 100));
}

/** Add tax to an amount, returning { net, tax, gross } all in cents */
export function addTax(
  netCents: number,
  ratePercent: number
): { net: number; tax: number; gross: number } {
  const tax = calculateTax(netCents, ratePercent);
  return { net: netCents, tax, gross: netCents + tax };
}

/** Sum an array of cent values safely */
export function sumCents(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
