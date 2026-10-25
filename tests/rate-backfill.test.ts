import { test } from "node:test";
import assert from "node:assert/strict";
import { feedRateToPairRate } from "../lib/currency/rate-backfill";
import { deriveRates } from "../lib/currency/triangulate";
import { convertAmount } from "../lib/currency/converter";

test("a rate from the feed is stored target-per-base, the same way the sync stores it", () => {
  // ECB feed quoted in SGD: 1 SGD buys 0.6947 EUR.
  const feed = { base: "SGD", rates: { EUR: 0.6947 } };
  const stored = feedRateToPairRate(feed.rates.EUR);
  const synced = deriveRates(feed, "SGD");

  assert.equal(stored, 694700);
  assert.deepEqual(synced, [{ targetCurrency: "EUR", rate: 694700 }]);
});

test("the stored rate converts a foreign amount into the base currency, not away from it", () => {
  const stored = feedRateToPairRate(0.6947); // SGD -> EUR
  const inverse = Math.round(1_000_000_000_000 / stored); // EUR -> SGD, as getExchangeRate does
  assert.equal(inverse, 1_439_470);
  // 441.60 EUR of founder spend is about 635.7 SGD, never 306.8.
  assert.equal(convertAmount(44160, inverse), 63567);
});
