import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveRates } from "../lib/currency/triangulate";

// USD-quoted feed (as the free OXR / open.er-api shape would give for USD).
// Includes the base itself (USD:1), and an invalid code (XXX) that must be dropped.
const usdFeed = {
  base: "USD",
  rates: { USD: 1, EUR: 0.9, GBP: 0.8, ZAR: 18, JPY: 150, XXX: 5 },
};

const rateFor = (rows: { targetCurrency: string; rate: number }[], code: string) =>
  rows.find((r) => r.targetCurrency === code)?.rate;

test("direct passthrough when base matches feed base", () => {
  const rows = deriveRates(usdFeed, "USD");
  assert.equal(rateFor(rows, "EUR"), 900_000);
  assert.equal(rateFor(rows, "GBP"), 800_000);
  assert.equal(rateFor(rows, "ZAR"), 18_000_000);
  // base itself is never emitted as its own target
  assert.equal(rateFor(rows, "USD"), undefined);
});

test("invalid currency codes are dropped", () => {
  const rows = deriveRates(usdFeed, "USD");
  assert.equal(rateFor(rows, "XXX"), undefined);
});

test("triangulates an arbitrary base out of a USD feed", () => {
  const rows = deriveRates(usdFeed, "EUR");
  // EUR->GBP = (USD->GBP) / (USD->EUR) = 0.8 / 0.9 = 0.8888..
  assert.equal(rateFor(rows, "GBP"), Math.round((0.8 / 0.9) * 1_000_000));
  // EUR->ZAR = 18 / 0.9 = 20.0 exactly
  assert.equal(rateFor(rows, "ZAR"), 20_000_000);
  // EUR->USD = 1 / 0.9 (the feed base must be reachable as a target)
  assert.equal(rateFor(rows, "USD"), Math.round((1 / 0.9) * 1_000_000));
  assert.equal(rateFor(rows, "EUR"), undefined);
});

test("triangulation is inverse-consistent with the direct rate", () => {
  const eur = deriveRates(usdFeed, "EUR");
  const eurToUsd = rateFor(eur, "USD")!;
  // round-tripping EUR->USD and back should land within rounding tolerance of 1.0
  const usdToEur = 900_000; // from the direct USD feed
  const roundTrip = (eurToUsd * usdToEur) / 1_000_000;
  assert.ok(Math.abs(roundTrip - 1_000_000) <= 2, `round trip ${roundTrip}`);
});

test("returns empty when the base is not reachable from the feed", () => {
  // AED is neither the feed base nor one of its targets.
  assert.deepEqual(deriveRates(usdFeed, "AED"), []);
});

test("recovers the quote base from a feed that omits it (Frankfurter shape)", () => {
  // Frankfurter quotes against `base` and does NOT include base in `rates`.
  const eurFeed = { base: "EUR", rates: { USD: 1.1, GBP: 0.85, ZAR: 20 } };
  const rows = deriveRates(eurFeed, "USD");
  // USD->EUR must exist even though the EUR feed never listed EUR in rates.
  assert.equal(rateFor(rows, "EUR"), Math.round((1 / 1.1) * 1_000_000));
  // USD->GBP = 0.85 / 1.1
  assert.equal(rateFor(rows, "GBP"), Math.round((0.85 / 1.1) * 1_000_000));
});
