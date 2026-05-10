import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTotal } from "../src/parsers/total";
import { L, resetLineY } from "./helpers";

test("parseTotal: picks 'Total' line over 'Subtotal'", () => {
  resetLineY();
  const lines = [
    L("Subtotal 10.00"),
    L("Tax 2.00"),
    L("Total 12.00"),
  ];
  const r = parseTotal(lines);
  assert.equal(r.total.value, 1200);
  assert.equal(r.subtotal.value, 1000);
  assert.ok(r.total.confidence > 0.5);
});

test("parseTotal: handles 'Grand Total' phrasing", () => {
  resetLineY();
  const lines = [L("Items 5.00"), L("Grand Total $99.99")];
  const r = parseTotal(lines);
  assert.equal(r.total.value, 9999);
});

test("parseTotal: avoids 'Total Tax' negative line", () => {
  resetLineY();
  const lines = [
    L("Item A 10.00"),
    L("Total Tax 2.00"),
    L("Total 12.00"),
  ];
  const r = parseTotal(lines);
  assert.equal(r.total.value, 1200);
});

test("parseTotal: fallback picks largest in bottom third", () => {
  resetLineY();
  // No 'total' keyword anywhere; rely on bottom-third largest amount.
  const lines = [
    L("Item A 5.00", 0),
    L("Item B 3.00", 30),
    L("Item C 2.00", 60),
    L("99.99", 200),
  ];
  const r = parseTotal(lines);
  assert.equal(r.total.value, 9999);
});
