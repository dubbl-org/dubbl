import { eq, and, desc, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { consolidationRate } from "@/lib/db/schema";
import {
  getExchangeRate,
  convertAmount,
  MissingExchangeRateError,
} from "@/lib/currency/converter";

/**
 * Currency translation for consolidation worksheets (IAS 21 / ASC 830).
 *
 * This is reporting-layer logic only — nothing here posts to a member entity's
 * general ledger. Each member's per-account balances are translated from its
 * functional currency into the group's presentation currency, applying:
 *   - assets & liabilities at the CLOSING rate,
 *   - revenue & expenses at the AVERAGE rate,
 *   - equity at the HISTORICAL rate.
 * The mixed-rate residual that prevents the balance sheet from footing is the
 * Cumulative Translation Adjustment (CTA), computed in the report route.
 *
 * Rates are resolved per (group, currency, rateType, periodEnd): a manually
 * entered consolidationRate wins; otherwise we fall back to the org-level
 * exchangeRate table via getExchangeRate. A member whose functional currency
 * already equals the presentation currency translates 1:1. A genuinely missing
 * rate throws MissingExchangeRateError — we never silently substitute 1:1.
 */

export type RateType = "closing" | "average" | "historical";

const UNIT = 1_000_000; // 6dp fixed-point: 1_000_000 = 1.0

export interface TranslateGroupInfo {
  id: string;
  parentOrgId: string;
  presentationCurrency: string;
}

/**
 * Map an account type to the IAS 21 rate that should translate its balance.
 */
export function classifyRate(accountType: string): RateType {
  switch (accountType) {
    case "asset":
    case "liability":
      return "closing";
    case "revenue":
    case "expense":
      return "average";
    case "equity":
      return "historical";
    default:
      // Unknown types translate at the closing (spot) rate, the most defensible default.
      return "closing";
  }
}

/**
 * Resolve the integer (6dp) rate that converts `currency` into the group's
 * presentation currency for a given rate type and period end.
 *
 * Resolution order:
 *   1. functional currency == presentation currency → 1.0 (1_000_000).
 *   2. a manually entered consolidationRate for (group, currency, rateType,
 *      periodEnd or earlier) → use it.
 *   3. fall back to the org-level exchangeRate table (getExchangeRate).
 * Anything else throws MissingExchangeRateError — never 1:1.
 */
export async function rateFor(
  group: TranslateGroupInfo,
  currency: string,
  rateType: RateType,
  periodEnd: string
): Promise<number> {
  const presentation = group.presentationCurrency;
  if (currency === presentation) return UNIT;

  // 1. Group-specific manual/derived consolidation rate (most recent on/before periodEnd).
  const stored = await db.query.consolidationRate.findFirst({
    where: and(
      eq(consolidationRate.groupId, group.id),
      eq(consolidationRate.currencyCode, currency),
      eq(consolidationRate.rateType, rateType),
      lte(consolidationRate.periodEndDate, periodEnd)
    ),
    orderBy: desc(consolidationRate.periodEndDate),
  });
  if (stored) return stored.rate;

  // 2. Fall back to the parent org's exchange-rate table.
  const fallback = await getExchangeRate(
    group.parentOrgId,
    currency,
    presentation,
    periodEnd
  );
  if (fallback != null) return fallback;

  throw new MissingExchangeRateError(currency, presentation, periodEnd);
}

/**
 * Translate an amount (cents, in `currency`) into presentation-currency cents
 * using the rate for the given account-type classification.
 */
export async function translateAmount(
  group: TranslateGroupInfo,
  amountCents: number,
  currency: string,
  rateType: RateType,
  periodEnd: string
): Promise<number> {
  const rate = await rateFor(group, currency, rateType, periodEnd);
  return convertAmount(amountCents, rate);
}

/**
 * Cache of resolved rates per (currency, rateType) for a single report run so a
 * member's many account lines don't re-query the same rate. Caller scopes one
 * cache per report invocation.
 */
export class RateResolver {
  private cache = new Map<string, number>();

  constructor(
    private group: TranslateGroupInfo,
    private periodEnd: string
  ) {}

  async rate(currency: string, rateType: RateType): Promise<number> {
    const key = `${currency}:${rateType}`;
    const hit = this.cache.get(key);
    if (hit != null) return hit;
    const r = await rateFor(this.group, currency, rateType, this.periodEnd);
    this.cache.set(key, r);
    return r;
  }

  /** Translate `amountCents` of `currency` for the given account type. */
  async translate(
    amountCents: number,
    currency: string,
    accountType: string
  ): Promise<number> {
    const r = await this.rate(currency, classifyRate(accountType));
    return convertAmount(amountCents, r);
  }

  /** Translate `amountCents` of `currency` at an explicit rate type. */
  async translateAt(
    amountCents: number,
    currency: string,
    rateType: RateType
  ): Promise<number> {
    const r = await this.rate(currency, rateType);
    return convertAmount(amountCents, r);
  }
}

/**
 * Net signed balance of an account, expressed as a positive number for the
 * account type's natural side:
 *   - assets & expenses are debit-natured  → debit − credit
 *   - liabilities, equity & revenue are credit-natured → credit − debit
 * Returned in the same currency/units as the inputs.
 */
export function naturalBalance(
  accountType: string,
  totalDebit: number,
  totalCredit: number
): number {
  switch (accountType) {
    case "asset":
    case "expense":
      return totalDebit - totalCredit;
    default:
      // liability, equity, revenue, and any unknown credit-natured type
      return totalCredit - totalDebit;
  }
}

/**
 * Cumulative Translation Adjustment (CTA): the residual that makes a
 * mixed-rate translated balance sheet foot. Under IAS 21 the balance sheet is
 * translated at closing rates and the income statement at average rates, so the
 * translated equity (historical) plus translated net income (average) will not
 * equal translated net assets (closing). The CTA is the equity plug that
 * absorbs that difference:
 *
 *   CTA = translatedAssets − translatedLiabilities − translatedEquity − translatedNetIncome
 *
 * A positive CTA increases equity (credit); a negative CTA reduces it.
 * All inputs are presentation-currency cents.
 */
export function computeCta(input: {
  translatedAssets: number;
  translatedLiabilities: number;
  translatedEquity: number;
  translatedNetIncome: number;
}): number {
  return (
    input.translatedAssets -
    input.translatedLiabilities -
    input.translatedEquity -
    input.translatedNetIncome
  );
}

/**
 * Functional currency for a consolidation member: the explicit
 * `functionalCurrency` override on the membership row, else the member
 * organization's defaultCurrency, else the group presentation currency.
 */
export function memberFunctionalCurrency(
  memberFunctionalCurrency: string | null | undefined,
  orgDefaultCurrency: string | null | undefined,
  presentationCurrency: string
): string {
  return (
    memberFunctionalCurrency || orgDefaultCurrency || presentationCurrency
  );
}
