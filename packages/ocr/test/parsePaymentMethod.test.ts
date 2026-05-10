import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePaymentMethod } from "../src/parsers/paymentMethod";
import { L, resetLineY } from "./helpers";

test("parsePaymentMethod: 'Paid by VISA' phrase + literal", () => {
  resetLineY();
  const f = parsePaymentMethod([L("Paid by VISA ****1234")]);
  assert.match(f.value ?? "", /Visa/);
  assert.match(f.value ?? "", /1234/);
});

test("parsePaymentMethod: bare card brand fallback", () => {
  resetLineY();
  const f = parsePaymentMethod([L("MASTERCARD ENDING IN 4242")]);
  assert.match(f.value ?? "", /Mastercard/);
  assert.match(f.value ?? "", /4242/);
});

test("parsePaymentMethod: 'Cash' literal", () => {
  resetLineY();
  const f = parsePaymentMethod([L("CASH")]);
  assert.match(f.value ?? "", /Cash/);
});

test("parsePaymentMethod: returns null when none found", () => {
  resetLineY();
  const f = parsePaymentMethod([L("Thanks for shopping")]);
  assert.equal(f.value, null);
});
