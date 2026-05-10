import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
  toCents,
  findAmounts,
  rightmostAmount,
  largestAmount,
} from "../src/util/number";

test("parseAmount: US dot decimal", () => {
  assert.equal(parseAmount("12.50"), 12.5);
  assert.equal(parseAmount("$12.50"), 12.5);
  assert.equal(parseAmount("1,234.56"), 1234.56);
});

test("parseAmount: EU comma decimal", () => {
  assert.equal(parseAmount("12,50"), 12.5);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("€1.234,56"), 1234.56);
});

test("parseAmount: thousands grouping with no decimal", () => {
  assert.equal(parseAmount("1.234"), 1234);
  assert.equal(parseAmount("1,234"), 1234);
});

test("parseAmount: negatives and signs", () => {
  assert.equal(parseAmount("-12.50"), -12.5);
  assert.equal(parseAmount("+12.50"), 12.5);
});

test("parseAmount: gibberish returns NaN or 0", () => {
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("")));
});

test("toCents: rounds to integer cents", () => {
  assert.equal(toCents(12.5), 1250);
  assert.equal(toCents(12.005), 1201);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(NaN), 0);
});

test("findAmounts: extracts ordered numeric tokens", () => {
  const a = findAmounts("Subtotal 10.00 Tax 2.00 Total 12.00");
  const values = a.map((m) => m.value);
  assert.deepEqual(values, [10, 2, 12]);
});

test("rightmostAmount: returns last numeric token", () => {
  const m = rightmostAmount("Apples 1.50 Oranges 2.00");
  assert.equal(m?.value, 2);
});

test("largestAmount: returns biggest by absolute value", () => {
  const m = largestAmount("Apples 1.50 Oranges 99.99 Discount -2.00");
  assert.equal(m?.value, 99.99);
});
