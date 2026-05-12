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

test("parseLineItems: tabular structure trumps arithmetic mismatch (OCR misread tolerance)", () => {
  // Real-world case: OCR misreads "300.00" as "30.00" in a 4-column invoice.
  // The column STRUCTURE is still intact (qty + 2 prices), so we should
  // trust it and emit qty=3, unit=100.00, amount=30.00. Confidence on
  // those three fields is lowered because qty*unit != amount, signalling
  // the user should double-check — but we don't drop the row to single-
  // amount, which would have lost the qty entirely.
  resetLineY();
  const lines = [L("Electronic Products or Services 3 100.00 30.00")];
  const items = parseLineItems(lines);
  assert.equal(items.length, 1);
  assert.equal(items[0].description.value, "Electronic Products or Services");
  assert.equal(items[0].quantity.value, 3);
  assert.equal(items[0].unitPrice.value, 10000);
  assert.equal(items[0].amount.value, 3000);
  // Arithmetic mismatch must dampen confidence so the UI flags this row.
  assert.ok(
    items[0].amount.confidence < 0.9,
    `confidence ${items[0].amount.confidence} should be below 0.9 on a mismatch`
  );
});
