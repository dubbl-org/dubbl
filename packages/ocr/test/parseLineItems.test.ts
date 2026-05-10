import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLineItems } from "../src/parsers/lineItems";
import { L, resetLineY } from "./helpers";

test("parseLineItems: simple 'desc price' lines", () => {
  resetLineY();
  const lines = [
    L("Coffee 4.50"),
    L("Bagel 3.25"),
  ];
  const items = parseLineItems(lines);
  assert.equal(items.length, 2);
  assert.equal(items[0].description.value, "Coffee");
  assert.equal(items[0].amount.value, 450);
  assert.equal(items[1].description.value, "Bagel");
  assert.equal(items[1].amount.value, 325);
});

test("parseLineItems: leading 'qty x' prefix", () => {
  resetLineY();
  const lines = [L("2 x Latte 9.00")];
  const items = parseLineItems(lines);
  assert.equal(items.length, 1);
  assert.equal(items[0].description.value, "Latte");
  assert.equal(items[0].quantity.value, 2);
  assert.equal(items[0].amount.value, 900);
});

test("parseLineItems: skips 'Subtotal' / 'Tax' lines", () => {
  resetLineY();
  const lines = [
    L("Bagel 3.25"),
    L("Subtotal 3.25"),
    L("Tax 0.30"),
  ];
  const items = parseLineItems(lines);
  assert.equal(items.length, 1);
  assert.equal(items[0].description.value, "Bagel");
});

test("parseLineItems: stops at total line bbox", () => {
  resetLineY();
  const lines = [
    L("Coffee 4.50", 0),
    L("Total 4.50", 100),
    L("Thanks 0.00", 200),
  ];
  const items = parseLineItems(lines, undefined, 100);
  // Items below totalY=100 are skipped.
  assert.equal(items.length, 1);
});
