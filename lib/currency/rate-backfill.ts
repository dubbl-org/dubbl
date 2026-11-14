import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exchangeRate, organization } from "@/lib/db/schema";
import { datedProvider } from "./rate-provider";

/** Rate stored as an integer with this many decimal places (1.000000 = 1000000). */
const SCALE = 1_000_000;

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Weekdays only: the ECB publishes nothing on weekends and the lookup carries Friday forward. */
function businessDays(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(toIso(d));
  }
  return out;
}

export interface BackfillResult {
  requested: number;
  stored: number;
  dates: number;
  skipped: string[];
}

/**
 * Store the dated rates one currency needs against the organisation's base.
 *
 * The lookup in `getExchangeRate` takes the latest rate on or before a date, so
 * a weekend transaction is served by Friday's row; that is why only business
 * days are fetched. Manual rows are never overwritten.
 */
export async function backfillRates(
  organizationId: string,
  baseCurrency: string,
  currencies: string[],
  from: string,
  to: string
): Promise<BackfillResult> {
  const provider = datedProvider();

  const pairs = currencies.filter((c) => c && c !== baseCurrency);
  if (pairs.length === 0) return { requested: 0, stored: 0, dates: 0, skipped: [] };

  const dates = businessDays(from, to);
  const skipped: string[] = [];
  let stored = 0;

  for (const date of dates) {
    let feed;
    try {
      feed = await provider.fetchRatesFor(baseCurrency, date);
    } catch {
      skipped.push(date);
      continue;
    }

    const rows = pairs
      .map((code) => {
        const perUnit = feed.rates[code];
        if (!perUnit || perUnit <= 0) return null;
        return {
          organizationId,
          baseCurrency,
          targetCurrency: code,
          rate: Math.round(SCALE / perUnit),
          date: feed.date,
          source: "api" as const,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      skipped.push(date);
      continue;
    }

    await db
      .insert(exchangeRate)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          exchangeRate.organizationId,
          exchangeRate.baseCurrency,
          exchangeRate.targetCurrency,
          exchangeRate.date,
        ],
        set: { rate: sql`excluded.rate`, source: sql`excluded.source` },
        setWhere: sql`${exchangeRate.source} <> 'manual'`,
      });
    stored += rows.length;
  }

  return { requested: dates.length * pairs.length, stored, dates: dates.length, skipped };
}

/**
 * Pull today's rates for every pair the organisation tracks, plus any currency
 * that has just appeared. Used after a statement import, off the request path:
 * one call covers the whole set instead of one per row.
 */
export async function ensureRateSuite(organizationId: string, extraCurrency?: string): Promise<void> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true },
  });
  if (!org) return;

  const known = await db
    .selectDistinct({ code: exchangeRate.targetCurrency })
    .from(exchangeRate)
    .where(eq(exchangeRate.organizationId, organizationId));

  const currencies = [...new Set([...known.map((k) => k.code), extraCurrency])]
    .filter((c): c is string => Boolean(c) && c !== org.defaultCurrency);

  if (currencies.length === 0) return;

  // Two years back covers any statement a user is likely to import, and the
  // lookup carries each rate forward from its date.
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
  await backfillRates(organizationId, org.defaultCurrency, currencies, from, today);
}

/**
 * Make sure one date has a rate for this currency before anything is posted.
 *
 * Called when a foreign-currency transaction is created: the pairs already in
 * the table are refreshed for that date, and a currency the organisation has
 * never used before is added to them, which is how the set of tracked pairs
 * grows without configuration.
 */
export async function ensureRatesForDate(
  organizationId: string,
  baseCurrency: string,
  currency: string,
  date: string
): Promise<void> {
  if (!currency || currency === baseCurrency) return;

  const known = await db
    .selectDistinct({ code: exchangeRate.targetCurrency })
    .from(exchangeRate)
    .where(and(eq(exchangeRate.organizationId, organizationId), eq(exchangeRate.baseCurrency, baseCurrency)));

  const currencies = [...new Set([...known.map((k) => k.code), currency])].filter(
    (c) => c !== baseCurrency
  );

  const already = await db.query.exchangeRate.findFirst({
    where: and(
      eq(exchangeRate.organizationId, organizationId),
      eq(exchangeRate.baseCurrency, baseCurrency),
      inArray(exchangeRate.targetCurrency, [currency]),
      eq(exchangeRate.date, date)
    ),
  });
  if (already) return;

  await backfillRates(organizationId, baseCurrency, currencies, date, date);
}
