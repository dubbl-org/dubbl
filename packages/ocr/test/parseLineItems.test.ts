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

test("parseLineItems: tabular [desc] [qty] [unit] [amount] layout", () => {
  resetLineY();
  const lines = [
    L("Electronic Products or Services 3 100.00 300.00"),
    L("Shipping & Handling 1 25.00 25.00"),
    L("Extended Warranty 2 49.99 99.98"),
  ];
  const items = parseLineItems(lines);
  assert.equal(items.length, 3);

  assert.equal(items[0].description.value, "Electronic Products or Services");
  assert.equal(items[0].quantity.value, 3);
  assert.equal(items[0].unitPrice.value, 10000);
  assert.equal(items[0].amount.value, 30000);

  assert.equal(items[1].description.value, "Shipping & Handling");
  assert.equal(items[1].quantity.value, 1);
  assert.equal(items[1].unitPrice.value, 2500);
  assert.equal(items[1].amount.value, 2500);

  assert.equal(items[2].description.value, "Extended Warranty");
  assert.equal(items[2].quantity.value, 2);
  assert.equal(items[2].unitPrice.value, 4999);
  assert.equal(items[2].amount.value, 9998);
});

test("parseLineItems: tabular layout doesn't misfire on grocery '1.32 LB' weights", () => {
  // ORG BANANAS 1.32 LB   1.05 — two priced amounts, but qty*unit doesn't
  // validate, so we should fall back to the single-amount interpretation.
  resetLineY();
  const lines = [L("ORG BANANAS 1.32 LB 1.05")];
  const items = parseLineItems(lines);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount.value, 105);
  assert.equal(items[0].quantity.value, 1);
});

test("parseLineItems: tabular validation requires qty * unit ≈ amount", () => {
  // Three priced amounts on the same line but the arithmetic doesn't work
  // out — should NOT be treated as tabular qty/unit/amount.
  resetLineY();
  const lines = [L("Bundle Deal 4 25.00 87.50")];
  const items = parseLineItems(lines);
  assert.equal(items.length, 1);
  // Falls back to single-amount mode: amount = rightmost.
  assert.equal(items[0].amount.value, 8750);
  // No tabular qty was accepted, so qty stays 1.
  assert.equal(items[0].quantity.value, 1);
});
