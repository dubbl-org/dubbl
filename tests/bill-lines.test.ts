import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBillLines, resolveBillPostingLines, journalImbalance } from "../lib/api/bill-lines";

test("bill lines: minor units, quantity x100 and tax on top", () => {
  const rates = new Map([["vat20", 2000]]);
  const r = buildBillLines(
    [
      { description: "Paper", quantity: 3, unitPrice: 12.5, taxRateId: "vat20" },
      { description: "Pens", quantity: 1.5, unitPrice: 2 },
    ],
    "USD",
    rates
  );
  assert.equal(r.lines[0].quantity, 300);
  assert.equal(r.lines[0].unitPrice, 1250);
  assert.equal(r.lines[0].amount, 3750);
  assert.equal(r.lines[0].taxAmount, 750);
  assert.equal(r.lines[1].amount, 300);
  assert.equal(r.lines[1].taxAmount, 0);
  assert.equal(r.subtotal, 4050);
  assert.equal(r.taxTotal, 750);
  assert.equal(r.total, 4800);
  assert.equal(r.amountDue, 4800);
});

test("bill lines: discount in basis points comes off before tax", () => {
  const r = buildBillLines(
    [{ description: "Desk", quantity: 1, unitPrice: 100, discountPercent: 1000, taxRateId: "t" }],
    "USD",
    new Map([["t", 1000]])
  );
  assert.equal(r.lines[0].amount, 9000);
  assert.equal(r.lines[0].taxAmount, 900);
  assert.equal(r.total, 9900);
});

test("bill lines: reverse-charge VAT is reported but not owed to the supplier", () => {
  const r = buildBillLines(
    [
      { description: "Consulting", quantity: 1, unitPrice: 1000, taxRateId: "rc" },
      { description: "Local", quantity: 1, unitPrice: 100, taxRateId: "std" },
    ],
    "EUR",
    new Map([["rc", 2000], ["std", 2000]]),
    new Map([["rc", "reverse_charge"], ["std", "standard"]])
  );
  assert.equal(r.taxTotal, 22000);
  assert.equal(r.total, 132000);
  assert.equal(r.amountDue, 112000);
});

test("bill lines: zero-decimal currencies are not scaled by 100", () => {
  const r = buildBillLines([{ description: "Rent", quantity: 2, unitPrice: 5000 }], "JPY", new Map());
  assert.equal(r.lines[0].unitPrice, 5000);
  assert.equal(r.total, 10000);
});

test("bill posting: a line with no account falls back instead of being dropped", () => {
  const lines = resolveBillPostingLines(
    [
      { accountId: "rent", amount: 100000, taxAmount: 0 },
      { accountId: null, amount: 4550, taxAmount: 910 },
      { accountId: null, amount: 0, taxAmount: 0 },
    ],
    "misc"
  );
  assert.deepEqual(lines.map((l) => [l.accountId, l.amount]), [["rent", 100000], ["misc", 4550]]);
  // AP is credited for every posted leg, so the entry balances and AP = the bill.
  const legs = [
    ...lines.map((l) => ({ debitAmount: l.amount, creditAmount: 0 })),
    { debitAmount: 910, creditAmount: 0 },
  ];
  const ap = journalImbalance(legs);
  assert.equal(ap, 100000 + 4550 + 910);
  assert.equal(journalImbalance([...legs, { debitAmount: 0, creditAmount: ap }]), 0);
});

test("bill posting: refuses a line with nowhere to post", () => {
  assert.throws(() => resolveBillPostingLines([{ accountId: null, amount: 500 }], null), /no account/);
});

test("bill posting: negative lines are kept so they can be credited", () => {
  const lines = resolveBillPostingLines([{ accountId: "a", amount: 1000 }, { accountId: null, amount: -200 }], "misc");
  assert.equal(lines.length, 2);
  assert.equal(lines[1].accountId, "misc");
  assert.equal(journalImbalance([{ debitAmount: 1000 }, { creditAmount: 200 }]), 800);
});
