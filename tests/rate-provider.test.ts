import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { allRatesTodayProvider, getRateProvider } from "../lib/currency/rate-provider";

const realFetch = globalThis.fetch;
const ENV_KEYS = ["OPENEXCHANGERATES_APP_ID", "ALLRATESTODAY_API_KEY", "EXCHANGE_RATE_PROVIDER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

test("allratestoday maps the rates array into a feed for the requested base", async () => {
  const calls = stubFetch(200, [
    { source: "USD", target: "EUR", rate: 0.85, time: "2026-10-21T23:00:00Z" },
    { source: "USD", target: "GBP", rate: 0.75, time: "2026-10-22T12:00:00Z" },
  ]);
  const feed = await allRatesTodayProvider("test-key").fetchRates("usd");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://allratestoday.com/api/v1/rates?source=usd");
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-key");

  assert.equal(feed.base, "USD");
  assert.equal(feed.date, "2026-10-22");
  assert.deepEqual(feed.rates, { EUR: 0.85, GBP: 0.75 });
});

test("allratestoday throws on a non-200 response", async () => {
  stubFetch(401, { error: "Invalid API key" });
  await assert.rejects(allRatesTodayProvider("bad").fetchRates("USD"), /allratestoday 401/);
});

test("allratestoday throws when the body is not an array", async () => {
  stubFetch(200, { error: "unexpected" });
  await assert.rejects(allRatesTodayProvider("k").fetchRates("USD"), /non-array/);
});

test("getRateProvider picks allratestoday only when its key is set", () => {
  for (const k of ENV_KEYS) delete process.env[k];
  assert.equal(getRateProvider().name, "exchangerate-api");

  process.env.ALLRATESTODAY_API_KEY = "k";
  assert.equal(getRateProvider().name, "allratestoday");

  // An Open Exchange Rates app id keeps precedence, as before.
  process.env.OPENEXCHANGERATES_APP_ID = "oxr";
  assert.equal(getRateProvider().name, "openexchangerates");
});
