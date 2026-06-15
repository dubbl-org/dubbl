import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../lib/money";

test("formats 2-decimal currencies with cents", () => {
  assert.match(formatMoney(1250, "USD"), /12\.50/);
});

test("formats 0-decimal currencies without decimals", () => {
  const out = formatMoney(1250, "JPY");
  assert.ok(!out.includes("."), `JPY should have no decimals: ${out}`);
  assert.match(out, /1,250/);
});

test("formats 3-decimal currencies with three places", () => {
  // 1250 minor units of KWD = 1.250
  assert.match(formatMoney(1250, "KWD"), /1\.250/);
});
