import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exchangeRate, organization } from "@/lib/db/schema";
import { getRateProvider, type RateFeed } from "@/lib/currency/rate-provider";
import { deriveRates } from "@/lib/currency/triangulate";

/**
 * Pull the latest exchange rates from the configured provider and upsert them
 * for every organization, quoted against each org's base (default) currency.
 *
 * - Each org base is triangulated out of a single feed, so base-currency
 *   support never depends on the provider honouring the base param (works on
 *   free plans too). See ./triangulate.
 * - Feeds are cached per fetch and reused for any base they can reach, so we
 *   make as few external calls as possible (matters for rate-limited free tiers).
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

  // Group orgs by base currency so we derive each base only once.
  const orgsByBase = new Map<string, string[]>();
  for (const o of orgs) {
    const base = (o.base || "USD").toUpperCase();
    if (!orgsByBase.has(base)) orgsByBase.set(base, []);
    orgsByBase.get(base)!.push(o.id);
  }

  const provider = getRateProvider();

  // Cache feeds by their actual quote base. A feed quoted in one base can
  // triangulate any of its targets, so reuse it instead of re-fetching.
  const feedCache = new Map<string, RateFeed>();
  async function feedFor(base: string): Promise<RateFeed | null> {
    for (const f of feedCache.values()) {
      if (f.base.toUpperCase() === base || typeof f.rates[base] === "number") {
        return f;
      }
    }
    try {
      const f = await provider.fetchRates(base);
      feedCache.set((f.base || base).toUpperCase(), f);
      return f;
    } catch (err) {
      console.error(`rate-sync: ${provider.name} failed for base ${base}`, err);
      return null;
    }
  }

  let upserts = 0;
  let bases = 0;

  for (const [base, orgIds] of orgsByBase) {
    const feed = await feedFor(base);
    if (!feed) continue;

    const rows = deriveRates(feed, base);
    if (rows.length === 0) {
      console.warn(
        `rate-sync: ${base} not reachable from ${provider.name} feed (quoted in ${feed.base}); skipping`
      );
      continue;
    }
    bases++;

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
