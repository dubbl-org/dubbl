import { test } from "node:test";
import assert from "node:assert/strict";
import {
  componentUnitsNeeded,
  marginPercent,
  markupPercent,
  splitByBasis,
  splitCostOnHand,
  totalsByItem,
  unitBookCost,
} from "../lib/inventory/math";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

test("splitByBasis: parts always add up to the amount", () => {
  assert.deepEqual(splitByBasis(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(sum(splitByBasis(10001, [3, 7, 11, 13])), 10001);
  assert.equal(sum(splitByBasis(1, [1, 1, 1, 1])), 1);
});

test("splitByBasis: proportional to the basis", () => {
  assert.deepEqual(splitByBasis(1000, [100, 300]), [250, 750]);
  // by value: freight of $50 over lines worth $200 and $800
  assert.deepEqual(splitByBasis(5000, [20000, 80000]), [1000, 4000]);
});

test("splitByBasis: zero and negative bases get nothing", () => {
  assert.deepEqual(splitByBasis(500, [0, 0]), [0, 0]);
  assert.deepEqual(splitByBasis(500, [0, 5]), [0, 500]);
  assert.deepEqual(splitByBasis(500, [-5, 5]), [0, 500]);
});

test("splitByBasis: negative amounts keep their sign", () => {
  const parts = splitByBasis(-101, [1, 1]);
  assert.equal(sum(parts), -101);
  assert.ok(parts.every((p) => p <= 0));
});

test("componentUnitsNeeded: quantity x build, plus wastage, rounded up", () => {
  assert.equal(componentUnitsNeeded(4, 10, 0), 40);
  assert.equal(componentUnitsNeeded(4, 10, 5), 42);
  assert.equal(componentUnitsNeeded(0.5, 3, 0), 2);
  // float noise must not round 6.000000001 up to 7
  assert.equal(componentUnitsNeeded(0.1, 60, 0), 6);
  assert.equal(componentUnitsNeeded(1.2, 5, 0), 6);
});

test("splitCostOnHand: all on hand is capitalised", () => {
  assert.deepEqual(splitCostOnHand(1000, 10, 10), { capitalized: 1000, expensed: 0 });
  assert.deepEqual(splitCostOnHand(1000, 25, 10), { capitalized: 1000, expensed: 0 });
});

test("splitCostOnHand: sold units' share goes to cost of sales", () => {
  assert.deepEqual(splitCostOnHand(1000, 4, 10), { capitalized: 400, expensed: 600 });
  assert.deepEqual(splitCostOnHand(1000, 0, 10), { capitalized: 0, expensed: 1000 });
  const r = splitCostOnHand(1001, 1, 3);
  assert.equal(r.capitalized + r.expensed, 1001);
});

test("marginPercent is profit over sale price, markup is over cost", () => {
  assert.equal(marginPercent(600, 1000), 40);
  assert.equal(markupPercent(600, 1000)?.toFixed(2), "66.67");
  assert.equal(marginPercent(600, 0), null);
  assert.equal(markupPercent(0, 1000), null);
});

test("unitBookCost: book value over units, else average, else purchase price", () => {
  assert.equal(unitBookCost({ quantityOnHand: 4, totalValue: 1000, averageCost: 999 }), 250);
  assert.equal(unitBookCost({ quantityOnHand: 0, totalValue: 0, averageCost: 300 }), 300);
  assert.equal(unitBookCost({ quantityOnHand: 0, totalValue: 0, averageCost: 0, purchasePrice: 120 }), 120);
});

test("totalsByItem sums repeated items", () => {
  const totals = totalsByItem([
    { inventoryItemId: "a", quantity: 2 },
    { inventoryItemId: "b", quantity: 1 },
    { inventoryItemId: "a", quantity: 3 },
  ]);
  assert.equal(totals.get("a"), 5);
  assert.equal(totals.get("b"), 1);
});
