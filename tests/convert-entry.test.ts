import { test } from "node:test";
import assert from "node:assert/strict";
import { convertLinesToBase } from "../lib/currency/convert-entry";

type L = { debitAmount: number; creditAmount: number };
const sum = (ls: L[], f: "debitAmount" | "creditAmount") =>
  ls.reduce((s, l) => s + l[f], 0);

test("converted invoice entry stays balanced", () => {
  const lines: L[] = [
    { debitAmount: 10000, creditAmount: 0 },
    { debitAmount: 0, creditAmount: 9091 },
    { debitAmount: 0, creditAmount: 909 },
  ];
  const out = convertLinesToBase(lines, 1_080_000);
  assert.equal(sum(out, "debitAmount"), sum(out, "creditAmount"));
});

test("balance holds under rounding-heavy rate", () => {
  const lines: L[] = [
    { debitAmount: 33333, creditAmount: 0 },
    { debitAmount: 0, creditAmount: 11111 },
    { debitAmount: 0, creditAmount: 11111 },
    { debitAmount: 0, creditAmount: 11111 },
  ];
  const out = convertLinesToBase(lines, 833_100);
  assert.equal(sum(out, "debitAmount"), sum(out, "creditAmount"));
});

test("unit rate leaves amounts unchanged", () => {
  const lines: L[] = [
    { debitAmount: 5000, creditAmount: 0 },
    { debitAmount: 0, creditAmount: 5000 },
  ];
  const out = convertLinesToBase(lines, 1_000_000);
  assert.deepEqual(out, lines);
});

test("converted total matches the document total converted as a whole", () => {
  const lines: L[] = [
    { debitAmount: 7777, creditAmount: 0 },
    { debitAmount: 778, creditAmount: 0 },
    { debitAmount: 0, creditAmount: 8555 },
  ];
  const out = convertLinesToBase(lines, 1_618_030);
  // 8555 * 1.61803 = 13842.27 -> 13842
  assert.equal(sum(out, "creditAmount"), 13842);
  assert.equal(sum(out, "debitAmount"), 13842);
});
