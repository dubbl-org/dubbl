import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVendor } from "../src/parsers/vendor";
import { L, resetLineY } from "./helpers";

test("parseVendor: picks first non-stopword line", () => {
  resetLineY();
  const lines = [
    L("ACME COFFEE"),
    L("123 Main St."),
    L("Phone: (555) 123-4567"),
    L("RECEIPT"),
  ];
  const f = parseVendor(lines);
  assert.equal(f.value, "Acme Coffee");
});

test("parseVendor: skips 'RECEIPT' header", () => {
  resetLineY();
  const lines = [
    L("RECEIPT"),
    L("BLUE BOTTLE"),
    L("100 Market Rd."),
  ];
  const f = parseVendor(lines);
  assert.equal(f.value, "Blue Bottle");
});

test("parseVendor: skips numeric-leading address lines", () => {
  resetLineY();
  const lines = [
    L("123 Pine Ave"),
    L("Joe's Diner"),
  ];
  const f = parseVendor(lines);
  assert.equal(f.value, "Joe's Diner");
});

test("parseVendor: returns null when no candidates", () => {
  resetLineY();
  const lines = [L("123"), L("RECEIPT")];
  const f = parseVendor(lines);
  assert.equal(f.value, null);
});
