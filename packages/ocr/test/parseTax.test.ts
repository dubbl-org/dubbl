import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTax } from "../src/parsers/tax";
import { L, resetLineY } from "./helpers";

test("parseTax: extracts tax amount and rate", () => {
  resetLineY();
  const lines = [L("VAT 20% 4.00")];
  const r = parseTax(lines);
  assert.equal(r.tax.value, 400);
  assert.equal(r.taxRate.value, 20);
});

test("parseTax: rate-only line, no amount", () => {
  resetLineY();
  const lines = [L("VAT @ 20%")];
  const r = parseTax(lines);
  assert.equal(r.tax.value, null);
  assert.equal(r.taxRate.value, 20);
});

test("parseTax: GST locale-mixed", () => {
  resetLineY();
  const lines = [L("GST 5% $0.50")];
  const r = parseTax(lines, "en-AU");
  assert.equal(r.tax.value, 50);
  assert.equal(r.taxRate.value, 5);
});

test("parseTax: does not pick rate digits as amount", () => {
  resetLineY();
  // "20" must not be picked as amount because it's followed by %.
  const lines = [L("VAT 20%")];
  const r = parseTax(lines);
  assert.equal(r.tax.value, null);
  assert.equal(r.taxRate.value, 20);
});

test("parseTax: prefers larger amount when multiple tax lines", () => {
  resetLineY();
  const lines = [L("VAT 20% 1.00"), L("VAT 20% 5.00")];
  const r = parseTax(lines);
  assert.equal(r.tax.value, 500);
});
