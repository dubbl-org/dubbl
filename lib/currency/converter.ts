import { db } from "@/lib/db";
import { exchangeRate } from "@/lib/db/schema";
import { eq, and, lte, desc } from "drizzle-orm";

/**
 * Get exchange rate for a currency pair on or before a given date.
 * Returns rate as integer (6 decimal places, 1000000 = 1.0)
 */
export async function getExchangeRate(
  orgId: string,
  baseCurrency: string,
  targetCurrency: string,
  date: string
): Promise<number | null> {
  if (baseCurrency === targetCurrency) return 1000000;

  // Try direct rate
  const direct = await db.query.exchangeRate.findFirst({
    where: and(
      eq(exchangeRate.organizationId, orgId),
      eq(exchangeRate.baseCurrency, baseCurrency),
      eq(exchangeRate.targetCurrency, targetCurrency),
      lte(exchangeRate.date, date)
    ),
    orderBy: desc(exchangeRate.date),
  });

  if (direct) return direct.rate;

  // Try inverse rate
  const inverse = await db.query.exchangeRate.findFirst({
    where: and(
      eq(exchangeRate.organizationId, orgId),
      eq(exchangeRate.baseCurrency, targetCurrency),
      eq(exchangeRate.targetCurrency, baseCurrency),
      lte(exchangeRate.date, date)
    ),
    orderBy: desc(exchangeRate.date),
  });

  if (inverse && inverse.rate !== 0) {
    return Math.round(1000000000000 / inverse.rate);
  }

  return null;
}

/**
 * Convert an amount using an exchange rate.
 * Both amount and rate are integers. Rate has 6 decimal places.
 * Returns converted amount in cents.
 */
export function convertAmount(amountCents: number, rate: number): number {
  return Math.round((amountCents * rate) / 1000000);
}

/**
 * Calculate FX gain/loss between original and current rate.
 * Returns positive for gain, negative for loss.
 */
export function calculateFxGainLoss(
  amountCents: number,
  originalRate: number,
  currentRate: number
): number {
  const originalConverted = convertAmount(amountCents, originalRate);
  const currentConverted = convertAmount(amountCents, currentRate);
  return currentConverted - originalConverted;
}
