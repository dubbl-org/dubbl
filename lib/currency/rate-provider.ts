/**
 * Pluggable exchange-rate data source.
 *
 * Default is ExchangeRate-API's open endpoint (open.er-api.com) — free, no API
 * key, ~160 currencies, and it honours any base currency. This is what lets
 * "any base currency" work out of the box with no configuration or paid plan.
 *
 * Two alternatives can be selected by env:
 *   - EXCHANGE_RATE_PROVIDER=frankfurter  → Frankfurter / ECB official daily
 *     reference rates. Only ~31 major currencies, but the most authoritative
 *     source for those (preferred by some accountants for audit defensibility).
 *   - OPENEXCHANGERATES_APP_ID=<key>      → Open Exchange Rates (~200 currencies
 *     incl. crypto/metals). The free OXR plan is USD-base only; we triangulate
 *     other bases out of the USD feed (see ./triangulate), so any base still
 *     works even on the free plan.
 *
 * Whatever the provider quotes against, the sync triangulates each org's base
 * out of a single feed, so base-currency support never depends on the plan.
 * Manual rates always win at the DB layer; this only supplies `source: "api"`.
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

/** Unix seconds -> YYYY-MM-DD, falling back to today if the feed omits a stamp. */
function unixToIsoDate(unixSeconds: number | undefined | null): string {
  const ms = unixSeconds && unixSeconds > 0 ? unixSeconds * 1000 : Date.now();
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * ExchangeRate-API open endpoint — free, keyless, ~160 currencies, any base.
 * https://www.exchangerate-api.com/docs/free
 */
const exchangeRateApiProvider: RateProvider = {
  name: "exchangerate-api",
  async fetchRates(base: string): Promise<RateFeed> {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`exchangerate-api ${res.status} for base ${base}`);
    }
    const data = (await res.json()) as {
      result?: string;
      base_code?: string;
      time_last_update_unix?: number;
      rates?: Record<string, number>;
    };
    if (data.result && data.result !== "success") {
      throw new Error(`exchangerate-api result=${data.result} for base ${base}`);
    }
    return {
      date: unixToIsoDate(data.time_last_update_unix),
      base: data.base_code ?? base,
      rates: data.rates ?? {},
    };
  },
};

/** Frankfurter / ECB — free, keyless, ~31 major currencies, official daily rates. */
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

/** Open Exchange Rates — ~200 currencies incl. crypto/metals; needs an app id. */
function openExchangeRatesProvider(appId: string): RateProvider {
  return {
    name: "openexchangerates",
    // NOTE: we deliberately ignore the requested base and always fetch the USD
    // feed. OXR's free/Developer plans REJECT a non-USD base with HTTP 403
    // (they don't ignore it), so sending one would 403 every non-USD org and
    // silently write zero rates. Instead we fetch USD once and let the sync
    // triangulate every other base out of it (see ./triangulate). This is
    // equally accurate on paid plans, so it keeps a single code path.
    async fetchRates(): Promise<RateFeed> {
      const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`openexchangerates ${res.status}`);
      }
      const data = (await res.json()) as {
        timestamp: number;
        base: string;
        rates: Record<string, number>;
      };
      return {
        date: unixToIsoDate(data.timestamp),
        base: data.base ?? "USD",
        rates: data.rates ?? {},
      };
    },
  };
}

export function getRateProvider(): RateProvider {
  const appId = process.env.OPENEXCHANGERATES_APP_ID;
  if (appId) return openExchangeRatesProvider(appId);

  if ((process.env.EXCHANGE_RATE_PROVIDER || "").toLowerCase() === "frankfurter") {
    return frankfurterProvider;
  }

  return exchangeRateApiProvider;
}
