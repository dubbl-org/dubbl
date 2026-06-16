import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currency } from "@/lib/db/schema";
import { getIsoCurrencies } from "@/lib/currency/iso4217";

/**
 * Idempotently populate the `currency` reference table from the canonical
 * ISO 4217 set, keeping name/symbol/decimalPlaces correct on every run.
 *
 * This makes the currency list self-healing: the dropdown can never collapse
 * to a near-empty table again, and no manual "run the seed" step is required.
 * Runs at most once per server process (cached promise); cheap thereafter.
 */
let ensured: Promise<void> | null = null;

export function ensureCurrencies(): Promise<void> {
  if (!ensured) {
    ensured = seedCurrencies().catch((err) => {
      // Don't cache a failed attempt — allow a later retry.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

async function seedCurrencies(): Promise<void> {
  const rows = getIsoCurrencies();
  if (rows.length === 0) return;

  await db
    .insert(currency)
    .values(
      rows.map((c) => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        decimalPlaces: c.decimalPlaces,
      }))
    )
    .onConflictDoUpdate({
      target: currency.code,
      set: {
        name: sql`excluded.name`,
        symbol: sql`excluded.symbol`,
        decimalPlaces: sql`excluded.decimal_places`,
      },
    });
}
