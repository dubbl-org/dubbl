import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionLines } from "../lib/api/requisition-lines";

test("lines are stored in cents with quantity x100 and no tax by default", () => {
  const r = buildRequisitionLines(
    [{ description: "Laptop", quantity: 3, unitPrice: 1299.99 }],
    "USD",
    new Map()
  );
  assert.deepEqual(r.lines[0], {
    description: "Laptop",
    quantity: 300,
    unitPrice: 129999,
    accountId: null,
    taxRateId: null,
    taxAmount: 0,
    amount: 389997,
    sortOrder: 0,
  });
  assert.equal(r.subtotal, 389997);
  assert.equal(r.taxTotal, 0);
  assert.equal(r.total, 389997);
});

test("a tax rate adds exclusive tax per line and to the total", () => {
  const r = buildRequisitionLines(
    [
      { description: "Chairs", quantity: 2, unitPrice: 50, taxRateId: "t10" },
      { description: "Delivery", quantity: 1, unitPrice: 19.99 },
    ],
    "USD",
    new Map([["t10", 1000]])
  );
  assert.equal(r.lines[0].taxAmount, 1000);
  assert.equal(r.lines[1].taxAmount, 0);
  assert.equal(r.lines[1].sortOrder, 1);
  assert.equal(r.subtotal, 11999);
  assert.equal(r.taxTotal, 1000);
  assert.equal(r.total, 12999);
});

test("amounts follow the currency's minor units", () => {
  const r = buildRequisitionLines([{ description: "Desk", quantity: 2, unitPrice: 15000 }], "JPY", new Map());
  assert.equal(r.lines[0].unitPrice, 15000);
  assert.equal(r.total, 30000);
});
