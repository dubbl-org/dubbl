import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitExpenseItemTax,
  splitExpenseClaimTax,
  type ExpenseTaxRate,
} from "../lib/api/expense-claim-tax";

const vat20: ExpenseTaxRate = { rate: 2000, kind: "standard", recoverablePercent: 10000 };

function balances(r: ReturnType<typeof splitExpenseClaimTax>) {
  const debits = r.items.reduce((s, i) => s + (i?.expenseDebit ?? 0), 0) + r.inputTax;
  const credits = r.payable + r.outputTax;
  assert.equal(debits, credits, `debits ${debits} != credits ${credits}`);
}

test("items without tax post the whole amount to the expense account", () => {
  assert.deepEqual(splitExpenseItemTax(1250, null), {
    gross: 1250, tax: 0, expenseDebit: 1250, inputTax: 0, outputTax: 0,
  });
  for (const kind of ["exempt", "no_vat"]) {
    const s = splitExpenseItemTax(1250, { rate: 2000, kind, recoverablePercent: 10000 });
    assert.equal(s.expenseDebit, 1250);
    assert.equal(s.inputTax, 0);
  }
  assert.equal(splitExpenseItemTax(1250, { ...vat20, rate: 0 }).expenseDebit, 1250);
});

test("standard rate splits a tax-inclusive amount into net + reclaimable tax", () => {
  // 120.00 at 20% inclusive = 100.00 net + 20.00 tax
  assert.deepEqual(splitExpenseItemTax(12000, vat20), {
    gross: 12000, tax: 2000, expenseDebit: 10000, inputTax: 2000, outputTax: 0,
  });
});

test("inclusive rounding keeps net + tax equal to the gross to the cent", () => {
  // 10.00 at 20%: tax = 1.666.. -> 1.67, net = 8.33
  const s = splitExpenseItemTax(1000, vat20);
  assert.equal(s.inputTax, 167);
  assert.equal(s.expenseDebit, 833);
  // 0.01 at 20% -> tax rounds to 0
  assert.equal(splitExpenseItemTax(1, vat20).inputTax, 0);
  // Odd rate (5.5%)
  for (const gross of [1, 99, 1055, 123457]) {
    const r = splitExpenseItemTax(gross, { rate: 550, kind: "standard", recoverablePercent: 10000 });
    assert.equal(r.expenseDebit + r.inputTax, gross);
  }
});

test("blocked and partly recoverable tax stays in the expense", () => {
  const blocked = splitExpenseItemTax(12000, { rate: 2000, kind: "blocked", recoverablePercent: 0 });
  assert.equal(blocked.tax, 2000);
  assert.equal(blocked.inputTax, 0);
  assert.equal(blocked.expenseDebit, 12000);

  const half = splitExpenseItemTax(12000, { rate: 2000, kind: "partial_block", recoverablePercent: 5000 });
  assert.equal(half.inputTax, 1000);
  assert.equal(half.expenseDebit, 11000);
});

test("US sales tax is shown but never reclaimed on a purchase", () => {
  const s = splitExpenseItemTax(10825, { rate: 825, kind: "sales_tax_us", recoverablePercent: 10000 });
  assert.equal(s.tax, 825);
  assert.equal(s.inputTax, 0);
  assert.equal(s.expenseDebit, 10825);
});

test("reverse charge self-accounts input and output tax on the net", () => {
  const s = splitExpenseItemTax(10000, { rate: 2000, kind: "reverse_charge", recoverablePercent: 10000 });
  assert.deepEqual(s, { gross: 10000, tax: 2000, expenseDebit: 10000, inputTax: 2000, outputTax: 2000 });
  const partial = splitExpenseItemTax(10000, { rate: 2000, kind: "reverse_charge", recoverablePercent: 5000 });
  assert.equal(partial.inputTax, 1000);
  assert.equal(partial.expenseDebit, 11000);
  assert.equal(partial.outputTax, 2000);
});

test("a multi-item claim balances and the payable is the gross total", () => {
  const r = splitExpenseClaimTax([
    { amount: 12000, tax: vat20 },
    { amount: 1000, tax: vat20 },
    { amount: 4550 },
    { amount: 0, tax: vat20 },
    { amount: 3333, tax: { rate: 500, kind: "standard", recoverablePercent: 10000 } },
    { amount: 10000, tax: { rate: 2000, kind: "reverse_charge", recoverablePercent: 10000 } },
  ]);
  assert.equal(r.items.length, 6);
  assert.equal(r.items[3], null);
  assert.equal(r.payable, 12000 + 1000 + 4550 + 3333 + 10000);
  // 2000 + 167 + 0 + round(3333*500/10500)=159 + 2000
  assert.equal(r.inputTax, 2000 + 167 + 159 + 2000);
  assert.equal(r.outputTax, 2000);
  balances(r);
});

test("every random claim balances to the cent", () => {
  const kinds = ["standard", "blocked", "partial_block", "exempt", "reverse_charge", "no_vat", "sales_tax_us"];
  let seed = 42;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  for (let k = 0; k < 500; k++) {
    const items = Array.from({ length: 1 + rnd(6) }, () => ({
      amount: rnd(500000),
      tax: rnd(4) === 0 ? null : { rate: rnd(3000), kind: kinds[rnd(kinds.length)], recoverablePercent: rnd(10001) },
    }));
    balances(splitExpenseClaimTax(items));
  }
});
