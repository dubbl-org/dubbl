import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFor, pickCode } from "../lib/api/bank-ledger-codes";

test("bandFor maps cash-type accounts to the 1100 bank band (asset)", () => {
  for (const t of ["checking", "savings", "cash", "investment", "other-unknown"]) {
    const b = bandFor(t);
    assert.equal(b.type, "asset");
    assert.equal(b.subType, "bank");
    assert.ok(b.preferred >= 1100 && b.preferred <= 1199);
  }
  assert.equal(bandFor("checking").preferred, 1100);
  assert.equal(bandFor("savings").preferred, 1110);
});

test("bandFor maps credit cards and loans to the 2600 liability band", () => {
  assert.equal(bandFor("credit_card").type, "liability");
  assert.equal(bandFor("credit_card").preferred, 2600);
  assert.equal(bandFor("loan").type, "liability");
  assert.ok(bandFor("loan").preferred >= 2600 && bandFor("loan").preferred <= 2699);
});

test("pickCode prefers the standard code when it is free", () => {
  assert.equal(pickCode(bandFor("checking"), new Set()), "1100");
  assert.equal(pickCode(bandFor("credit_card"), new Set()), "2600");
});

test("pickCode walks to the next free code when the standard is taken", () => {
  assert.equal(pickCode(bandFor("checking"), new Set(["1100"])), "1101");
  assert.equal(pickCode(bandFor("checking"), new Set(["1100", "1101", "1102"])), "1103");
});

test("pickCode returns null when the whole band is exhausted", () => {
  const band = bandFor("checking");
  const taken = new Set<string>();
  for (let c = band.lo; c <= band.hi; c++) taken.add(String(c));
  assert.equal(pickCode(band, taken), null);
});
