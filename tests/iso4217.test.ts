import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getIsoCurrencies,
  getCurrencyMinorUnits,
  isValidCurrencyCode,
} from "../lib/currency/iso4217";

test("includes major currencies with correct minor units", () => {
  const want: Record<string, number> = {
    USD: 2, EUR: 2, JPY: 0, KRW: 0, VND: 0, KWD: 3, BHD: 3, OMR: 3,
  };
  const list = getIsoCurrencies();
  for (const [code, units] of Object.entries(want)) {
    assert.ok(list.some((c) => c.code === code), `${code} present`);
    assert.equal(getCurrencyMinorUnits(code), units, `${code} minor units`);
  }
});

test("country-map currencies are present", () => {
  for (const c of ["KES", "NGN", "VND"]) {
    assert.ok(isValidCurrencyCode(c), `${c} valid`);
  }
});

test("excludes non-cash codes", () => {
  const list = getIsoCurrencies();
  for (const c of ["XXX", "XAU", "XDR"]) {
    assert.ok(!list.some((x) => x.code === c), `${c} excluded`);
  }
});

test("validation is case-insensitive and rejects bogus codes", () => {
  assert.ok(isValidCurrencyCode("usd"));
  assert.ok(!isValidCurrencyCode("ZZZ"));
  assert.ok(!isValidCurrencyCode(""));
  assert.ok(!isValidCurrencyCode(null));
});
