import { db } from "@/lib/db";
import { exchangeRate } from "@/lib/db/schema";
import { eq, and, lte, desc } from "drizzle-orm";

const RATE_SCALE = 1_000_000;

/**
 * How old an automatic rate may be (in days, relative to the date it is used
 * on) before we flag it as stale in the UI. Manual rates are deliberate
 * overrides and are never flagged stale.
 */
export const STALE_AFTER_DAYS = 7;

export type RateOrigin =
  | "same" // document currency equals base — trivially 1:1
  | "manual"
  | "api"
  | "manual-inverse"
  | "api-inverse";

export interface RateStatus {
  /** document->base rate (6-dp integer), or null when none is available. */
  rate: number | null;
  /** how the rate was resolved, or null when missing. */
  origin: RateOrigin | null;
  /** the date of the row actually used (YYYY-MM-DD), or null when missing. */
  effectiveDate: string | null;
  /** age in days of the rate relative to `asOf`, or null when missing. */
  ageDays: number | null;
  /** true when an automatic rate is older than STALE_AFTER_DAYS. */
  stale: boolean;
  /** true when no rate could be found for this pair on or before `asOf`. */
  missing: boolean;
}

const MISSING: RateStatus = {
  rate: null,
  origin: null,
  effectiveDate: null,
  ageDays: null,
  stale: false,
  missing: true,
};

/** Whole days between two YYYY-MM-DD dates (a - b), computed in UTC. */
function daysBetween(a: string, b: string): number {
  const ax = Date.parse(`${a}T00:00:00Z`);
  const bx = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ax) || Number.isNaN(bx)) return 0;
  return Math.round((ax - bx) / 86_400_000);
}

/**
 * Resolve the base-currency rate for a pair AND describe how current it is, so
 * callers can show "rate from Jun 14 (ECB)", warn when it's stale, or prompt
 * the user to enter a custom rate when none exists.
 *
 * `asOf` is the date the rate is being used on (e.g. a document's issue date);
 * freshness/age are measured against it. Mirrors getExchangeRate's direct- then
 * inverse-pair lookup, but returns the underlying row's date and source too.
 */
export async function getRateStatus(
  orgId: string,
  baseCurrency: string,
  targetCurrency: string,
  asOf: string
): Promise<RateStatus> {
  if (baseCurrency === targetCurrency) {
    return {
      rate: RATE_SCALE,
      origin: "same",
      effectiveDate: asOf,
      ageDays: 0,
      stale: false,
      missing: false,
    };
  }

  const direct = await db.query.exchangeRate.findFirst({
    where: and(
      eq(exchangeRate.organizationId, orgId),
      eq(exchangeRate.baseCurrency, baseCurrency),
      eq(exchangeRate.targetCurrency, targetCurrency),
      lte(exchangeRate.date, asOf)
    ),
    orderBy: desc(exchangeRate.date),
  });

  if (direct) {
    return classifyRate(direct.rate, direct.source as "manual" | "api", direct.date, asOf, false);
  }

  const inverse = await db.query.exchangeRate.findFirst({
    where: and(
      eq(exchangeRate.organizationId, orgId),
      eq(exchangeRate.baseCurrency, targetCurrency),
      eq(exchangeRate.targetCurrency, baseCurrency),
      lte(exchangeRate.date, asOf)
    ),
    orderBy: desc(exchangeRate.date),
  });

  if (inverse && inverse.rate !== 0) {
    const rate = Math.round((RATE_SCALE * RATE_SCALE) / inverse.rate);
    return classifyRate(rate, inverse.source as "manual" | "api", inverse.date, asOf, true);
  }

  return { ...MISSING };
}

/** Pure: build a RateStatus from a resolved row's fields. Exported for tests. */
export function classifyRate(
  rate: number,
  source: "manual" | "api",
  effectiveDate: string,
  asOf: string,
  inverse: boolean
): RateStatus {
  const ageDays = daysBetween(asOf, effectiveDate);
  const origin = (inverse ? `${source}-inverse` : source) as RateOrigin;
  const stale = source === "api" && ageDays > STALE_AFTER_DAYS;
  return { rate, origin, effectiveDate, ageDays, stale, missing: false };
}
