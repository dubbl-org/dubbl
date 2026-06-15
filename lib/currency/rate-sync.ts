import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exchangeRate, organization } from "@/lib/db/schema";
import { isValidCurrencyCode } from "@/lib/currency/iso4217";
import { getRateProvider } from "@/lib/currency/rate-provider";

const RATE_SCALE = 1_000_000; // 6 decimal places, matching exchangeRate.rate

/**
 * Pull the latest exchange rates from the configured provider and upsert them
 * for every organization, quoted against each org's base (default) currency.
 *
 * - One external fetch per distinct base currency (orgs sharing a base reuse it).
 * - Stores rates as `source: "api"`, and never overwrites a `manual` rate for
 *   the same day (manual override wins).
 *
 * Returns counts for observability. Designed to run daily via Trigger.dev.
 */
export async function processExchangeRateSync(): Promise<{
  bases: number;
  upserts: number;
}> {
  const orgs = await db
    .select({ id: organization.id, base: organization.defaultCurrency })
    .from(organization);

  // Group orgs by base currency so we fetch each base only once.
  const orgsByBase = new Map<string, string[]>();
  for (const o of orgs) {
    const base = (o.base || "USD").toUpperCase();
    if (!orgsByBase.has(base)) orgsByBase.set(base, []);
    orgsByBase.get(base)!.push(o.id);
  }

  const provider = getRateProvider();
  let upserts = 0;
  let bases = 0;

  for (const [base, orgIds] of orgsByBase) {
    let feed;
    try {
      feed = await provider.fetchRates(base);
    } catch (err) {
      console.error(`rate-sync: ${provider.name} failed for base ${base}`, err);
      continue;
    }
    bases++;

    const rows = Object.entries(feed.rates)
      .filter(([target]) => target !== base && isValidCurrencyCode(target))
      .map(([target, value]) => ({
        targetCurrency: target,
        rate: Math.round(value * RATE_SCALE),
      }))
      .filter((r) => r.rate > 0);

    if (rows.length === 0) continue;

    for (const orgId of orgIds) {
      const values = rows.map((r) => ({
        organizationId: orgId,
        baseCurrency: base,
        targetCurrency: r.targetCurrency,
        rate: r.rate,
        date: feed.date,
        source: "api" as const,
      }));

      await db
        .insert(exchangeRate)
        .values(values)
        .onConflictDoUpdate({
          target: [
            exchangeRate.organizationId,
            exchangeRate.baseCurrency,
            exchangeRate.targetCurrency,
            exchangeRate.date,
          ],
          set: { rate: sql`excluded.rate`, source: sql`excluded.source` },
          // Don't clobber a manually-entered rate for the same day.
          setWhere: sql`${exchangeRate.source} <> 'manual'`,
        });

      upserts += values.length;
    }
  }

  return { bases, upserts };
}
