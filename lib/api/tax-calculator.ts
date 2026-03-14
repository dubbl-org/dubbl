import { db } from "@/lib/db";
import { taxRate } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

/**
 * Preload tax rates by their IDs.
 * Returns a map of taxRateId -> rate in basis points (1000 = 10%).
 */
export async function preloadTaxRates(
  taxRateIds: string[]
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(taxRateIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rates = await db
    .select({ id: taxRate.id, rate: taxRate.rate })
    .from(taxRate)
    .where(inArray(taxRate.id, uniqueIds));

  return new Map(rates.map((r) => [r.id, r.rate]));
}

/**
 * Calculate tax amount from a pre-tax amount and a rate in basis points.
 * E.g. calcTax(10000, 1000) = 1000 (10% of $100.00 = $10.00)
 */
export function calcTax(amount: number, rate: number): number {
  return Math.round((amount * rate) / 10000);
}
