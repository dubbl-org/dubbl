import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "../lib/money";

test("formats 2-decimal currencies with cents", () => {
  assert.match(formatMoney(1250, "USD"), /12\.50/);
});

test("formats 0-decimal currencies without decimals", () => {
  const out = formatMoney(1250, "JPY");
  assert.ok(!out.includes("."), `JPY should have no decimals: ${out}`);
  assert.match(out, /1,250/);
});

test("formats 3-decimal currencies with three places", () => {
  // 1250 minor units of KWD = 1.250
  assert.match(formatMoney(1250, "KWD"), /1\.250/);
});

// --- currency-aware minor-unit conversions (B1 foundation) ---

test("decimalToMinorUnits scales by the currency's real minor units", () => {
  assert.equal(decimalToMinorUnits("12.50", "USD"), 1250); // 2 dp
  assert.equal(decimalToMinorUnits("10000", "JPY"), 10000); // 0 dp — NOT 1,000,000
  assert.equal(decimalToMinorUnits("1.234", "KWD"), 1234); // 3 dp
});

test("decimalToMinorUnits defaults to 2 decimals for unknown/USD", () => {
  assert.equal(decimalToMinorUnits("5", "USD"), 500);
  assert.equal(decimalToMinorUnits(5), 500);
});

test("minorUnitsToDecimal is the inverse of decimalToMinorUnits", () => {
  for (const [value, cur] of [
    ["12.50", "USD"],
    ["10000", "JPY"],
    ["1.234", "KWD"],
  ] as const) {
    const units = decimalToMinorUnits(value, cur);
    assert.equal(parseFloat(minorUnitsToDecimal(units, cur)), parseFloat(value));
  }
});

test("a JPY amount round-trips without the 100x inflation bug", () => {
  // The original bug: ¥10,000 stored as 1,000,000 then displayed as ¥1,000,000.
  const units = decimalToMinorUnits("10000", "JPY");
  assert.equal(units, 10000);
  assert.match(formatMoney(units, "JPY"), /(^|\D)10,000(\D|$)/);
});
