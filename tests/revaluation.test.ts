import { test } from "node:test";
import assert from "node:assert/strict";
import { revaluationLegs, reverseLegs } from "../lib/currency/convert-entry";

const sum = (legs: { debit: number; credit: number }[]) => ({
  d: legs.reduce((s, l) => s + l.debit, 0),
  c: legs.reduce((s, l) => s + l.credit, 0),
});

test("receivable revalued up -> unrealised gain, AR debited, balanced", () => {
  const legs = revaluationLegs("receivable", 800); // current > carried
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxGain")?.credit, 800);
  assert.equal(legs.find((l) => l.role === "counter")?.debit, 800);
});

test("receivable revalued down -> unrealised loss, balanced", () => {
  const legs = revaluationLegs("receivable", -500);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxLoss")?.debit, 500);
});

test("payable revalued up -> unrealised loss, AP credited, balanced", () => {
  const legs = revaluationLegs("payable", 800);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxLoss")?.debit, 800);
  assert.equal(legs.find((l) => l.role === "counter")?.credit, 800);
});

test("payable revalued down -> unrealised gain, balanced", () => {
  const legs = revaluationLegs("payable", -500);
  const { d, c } = sum(legs);
  assert.equal(d, c);
  assert.equal(legs.find((l) => l.role === "fxGain")?.credit, 500);
});

test("no rate movement -> no legs", () => {
  assert.equal(revaluationLegs("receivable", 0).length, 0);
});

test("reverseLegs swaps debit and credit and stays balanced", () => {
  const legs = revaluationLegs("receivable", 800);
  const rev = reverseLegs(legs);
  const a = sum(legs), b = sum(rev);
  assert.equal(b.d, a.c);
  assert.equal(b.c, a.d);
});
