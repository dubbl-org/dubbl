import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { convertAmount } from "@/lib/currency/converter";
import { getRateStatus, type RateStatus } from "@/lib/currency/rate-status";

const RATE_SCALE = 1_000_000;

export interface BaseConversion {
  baseCurrency: string;
  /** document->base rate (6-dp integer), or null when no rate is available. */
  rate: number | null;
  /** the input amounts converted to base minor units (null when no rate). */
  amounts: Record<string, number | null>;
  /** freshness/source of the rate used, so the UI can show it / warn / prompt. */
  status: RateStatus;
}

/**
 * Convert a set of named document-currency amounts (integer minor units) to the
 * organization's base currency using the rate effective on `date`. Returns
 * nulls when no rate is available so callers can fall back to the original
 * amount only. When the document already is the base currency, the amounts pass
 * through unchanged at a 1:1 rate.
 */
export async function toBaseAmounts(
  orgId: string,
  currencyCode: string,
  date: string,
  amounts: Record<string, number>,
  baseCurrencyHint?: string
): Promise<BaseConversion> {
  let baseCurrency = baseCurrencyHint;
  if (!baseCurrency) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, orgId),
      columns: { defaultCurrency: true },
    });
    baseCurrency = org?.defaultCurrency ?? "USD";
  }

  const status = await getRateStatus(orgId, currencyCode, baseCurrency, date);
  const rate = status.rate;

  if (currencyCode === baseCurrency) {
    return { baseCurrency, rate: RATE_SCALE, amounts: { ...amounts }, status };
  }

  const converted: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(amounts)) {
    converted[key] = rate == null ? null : convertAmount(value, rate);
  }
  return { baseCurrency, rate, amounts: converted, status };
}
