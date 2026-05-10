import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurrency } from "../src/parsers/currency";
import { L, resetLineY } from "./helpers";

test("parseCurrency: ISO code wins over symbol", () => {
  resetLineY();
  const lines = [L("Total: $12.00 (USD)")];
  const f = parseCurrency(lines);
  assert.equal(f.value, "USD");
  assert.ok(f.confidence > 0.9);
});

test("parseCurrency: € symbol → EUR", () => {
  resetLineY();
  const lines = [L("Total €12,00")];
  const f = parseCurrency(lines);
  assert.equal(f.value, "EUR");
});

test("parseCurrency: locale fallback when no symbol", () => {
  resetLineY();
  const lines = [L("Total 100")];
  const f = parseCurrency(lines, "hu-HU");
  assert.equal(f.value, "HUF");
});

test("parseCurrency: ambiguous $ uses locale default", () => {
  resetLineY();
  const lines = [L("$12.00")];
  const f = parseCurrency(lines, "en-AU");
  assert.equal(f.value, "AUD");
});
