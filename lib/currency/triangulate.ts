/**
 * Derive base->target rates for an *arbitrary* base currency from a single
 * provider feed, regardless of the base the provider actually quotes against.
 *
 * Some providers ignore the requested base (e.g. Open Exchange Rates on the
 * free plan always returns USD). Rather than store mislabelled rows, we
 * triangulate every org's base out of whatever the feed gave us:
 *
 *   rate(base -> target) = rate(feedBase -> target) / rate(feedBase -> base)
 *
 * This makes "any base currency" work on every provider and every plan, since
 * a feed quoted in one base implies the cross rate between any two of its
 * targets. Cross rates derived this way are mid-market reference rates (the
 * accounting standard) — they don't bake in a bank's cross-currency spread,
 * which is exactly what you want for the books.
 */

import { isValidCurrencyCode } from "@/lib/currency/iso4217";

const RATE_SCALE = 1_000_000; // 6 decimal places, matching exchangeRate.rate

export interface DerivedRate {
  targetCurrency: string;
  /** Integer rate, 6 decimal places (1_000_000 = 1.0). */
  rate: number;
}

/**
 * Returns base->target rates derived from `feed`, as integer 6dp values.
 * Returns `[]` when `base` cannot be reached from the feed (i.e. the feed is
 * not quoted in `base` and `base` is not one of its targets), so the caller
 * can skip that base rather than write nonsense.
 */
export function deriveRates(feed: { base: string; rates: Record<string, number> }, base: string): DerivedRate[] {
  const target = base.toUpperCase();
  const feedBase = (feed.base || "").toUpperCase();

  // units of `target` (the org base) per 1 unit of the feed's quote base.
  let feedBaseToBase: number;
  if (feedBase === target) {
    feedBaseToBase = 1;
  } else {
    const v = feed.rates[target] ?? feed.rates[base];
    if (!v || v <= 0) return []; // base not present in this feed — cannot derive
    feedBaseToBase = v;
  }

  const out: DerivedRate[] = [];
  const seen = new Set<string>();

  const push = (code: string, feedBaseToTarget: number) => {
    const t = code.toUpperCase();
    if (t === target || seen.has(t) || !isValidCurrencyCode(t)) return;
    if (!(feedBaseToTarget > 0)) return;
    const rate = Math.round((feedBaseToTarget / feedBaseToBase) * RATE_SCALE);
    if (rate > 0) {
      out.push({ targetCurrency: t, rate });
      seen.add(t);
    }
  };

  for (const [code, value] of Object.entries(feed.rates)) {
    if (typeof value === "number") push(code, value);
  }

  // Some feeds (e.g. Frankfurter) omit the quote base from `rates`. When we've
  // triangulated to a different base, make sure that quote base is reachable as
  // a target too (feedBase -> feedBase is 1 by definition).
  if (feedBase && feedBase !== target) push(feedBase, 1);

  return out;
}
