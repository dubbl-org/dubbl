import { test } from "node:test";
import assert from "node:assert/strict";
import { realizedSettlementLegs } from "../lib/currency/convert-entry";

const sum = (legs: { debit: number; credit: number }[]) => ({
  d: legs.reduce((s, l) => s + l.debit, 0),
  c: legs.reduce((s, l) => s + l.credit, 0),
});

test("invoice settled at a higher rate books a gain and balances", () => {
  // carried at 10000 base, received 10800 base -> 800 gain
  const legs = realizedSettlementLegs("invoice", 10800, 10000);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  const gain = legs.find((l) => l.role === "fxGain");
  assert.equal(gain?.credit, 800);
  assert.equal(legs.find((l) => l.role === "counter")?.credit, 10000); // AR fully cleared in base
});

test("invoice settled at a lower rate books a loss and balances", () => {
  const legs = realizedSettlementLegs("invoice", 9500, 10000);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxLoss")?.debit, 500);
});

test("bill paid at a higher rate books a loss and balances", () => {
  // carried at 10000 base, paid 10800 base -> 800 loss
  const legs = realizedSettlementLegs("bill", 10800, 10000);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxLoss")?.debit, 800);
  assert.equal(legs.find((l) => l.role === "counter")?.debit, 10000); // AP fully cleared in base
});

test("bill paid at a lower rate books a gain and balances", () => {
  const legs = realizedSettlementLegs("bill", 9500, 10000);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxGain")?.credit, 500);
});

test("no rate movement produces a simple two-line balanced entry", () => {
  const legs = realizedSettlementLegs("invoice", 10000, 10000);
  assert.equal(legs.length, 2);
  const { d, c } = sum(legs);
  assert.equal(d, c);
});
