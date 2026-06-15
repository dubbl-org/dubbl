/**
 * Pluggable exchange-rate data source.
 *
 * Default is Frankfurter (frankfurter.dev) — free, no API key, ECB daily
 * reference rates, supports base-currency selection. If an Open Exchange
 * Rates key is configured (OPENEXCHANGERATES_APP_ID) that provider is used
 * instead, which covers far more currencies. Manual rates always win at the
 * DB layer; this only supplies the automatic `source: "api"` rates.
 *
 * Note: ECB/Frankfurter only covers ~30 major currencies. Orgs whose base
 * currency isn't supported simply get no auto rates (sync skips them) until
 * a broader provider is configured.
 */

export interface RateFeed {
  /** ISO date (YYYY-MM-DD) the rates are effective for. */
  date: string;
  /** base currency the rates are quoted against. */
  base: string;
  /** target code -> units of target per 1 base. */
  rates: Record<string, number>;
}

export interface RateProvider {
  name: string;
  fetchRates(base: string): Promise<RateFeed>;
}

const frankfurterProvider: RateProvider = {
  name: "frankfurter",
  async fetchRates(base: string): Promise<RateFeed> {
    const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`frankfurter ${res.status} for base ${base}`);
    }
    const data = (await res.json()) as {
      date: string;
      base: string;
      rates: Record<string, number>;
    };
    return { date: data.date, base: data.base ?? base, rates: data.rates ?? {} };
  },
};

function openExchangeRatesProvider(appId: string): RateProvider {
  return {
    name: "openexchangerates",
    async fetchRates(base: string): Promise<RateFeed> {
      // base selection requires a paid plan; the free plan is USD-only and
      // will ignore the base param (callers should triangulate if needed).
      const url =
        `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}` +
        `&base=${encodeURIComponent(base)}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`openexchangerates ${res.status} for base ${base}`);
      }
      const data = (await res.json()) as {
        timestamp: number;
        base: string;
        rates: Record<string, number>;
      };
      const date = new Date((data.timestamp ?? 0) * 1000)
        .toISOString()
        .slice(0, 10);
      return { date, base: data.base ?? base, rates: data.rates ?? {} };
    },
  };
}

export function getRateProvider(): RateProvider {
  const appId = process.env.OPENEXCHANGERATES_APP_ID;
  if (appId) return openExchangeRatesProvider(appId);
  return frankfurterProvider;
}
