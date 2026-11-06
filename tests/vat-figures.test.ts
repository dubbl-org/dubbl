import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basFields,
  documentFigures,
  vatReturnBoxes,
  vatTotals,
  type TaxDocument,
} from "../lib/reports/vat-figures";
import { compoundRate, splitCompoundTax } from "../lib/tax/compound";

const doc = (d: Partial<TaxDocument>): TaxDocument => ({
  side: "sale",
  sign: 1,
  weight: 1,
  rate: 1_000_000,
  subtotal: 0,
  total: 0,
  crossBorder: false,
  lines: [],
  ...d,
});

const box = (boxes: { box: string; amount: number }[], b: string) => boxes.find((x) => x.box === b)?.amount;

test("reverse-charge VAT moves from Box 1 to Box 2 and Box 3 keeps the whole output VAT", () => {
  const totals = vatTotals([
    { entryKey: "sale", account: "output", debit: 0, credit: 2000 },
    // reverse-charge purchase: CR output 400, DR input 400 on the same entry
    { entryKey: "rc", account: "output", debit: 0, credit: 400 },
    { entryKey: "rc", account: "input", debit: 400, credit: 0 },
    { entryKey: "bill", account: "input", debit: 600, credit: 0 },
  ]);
  assert.deepEqual(totals, { outputVat: 2400, inputVat: 1000, reverseChargeVat: 400 });
  const boxes = vatReturnBoxes(totals, documentFigures([]));
  assert.equal(box(boxes, "1"), 2000);
  assert.equal(box(boxes, "2"), 400);
  assert.equal(box(boxes, "3"), 2400);
  assert.equal(box(boxes, "4"), 1000);
  assert.equal(box(boxes, "5"), 1400);
});

test("Box 6 and 7 are net of credit and debit notes and in base currency", () => {
  const figures = documentFigures([
    doc({ subtotal: 10000, total: 12000 }),
    doc({ sign: -1, subtotal: 1000, total: 1200 }),
    // EUR invoice at 1.10
    doc({ subtotal: 10000, total: 12000, rate: 1_100_000 }),
    doc({ side: "purchase", subtotal: 5000, total: 6000 }),
    doc({ side: "purchase", sign: -1, subtotal: 500, total: 600 }),
  ]);
  assert.equal(figures.netSales, 10000 - 1000 + 11000);
  assert.equal(figures.netPurchases, 4500);
  const boxes = vatReturnBoxes({ outputVat: 0, inputVat: 0, reverseChargeVat: 0 }, figures);
  assert.equal(box(boxes, "6"), 20000);
  assert.equal(box(boxes, "7"), 4500);
});

test("cash-basis weight scales a part-paid invoice", () => {
  const figures = documentFigures([doc({ subtotal: 10000, total: 12000, weight: 0.5 })]);
  assert.equal(figures.netSales, 5000);
  assert.equal(figures.grossSales, 6000);
});

test("flat rate: Box 1 is the percentage of gross turnover and Box 4 is 0", () => {
  const figures = documentFigures([doc({ subtotal: 10000, total: 12000 })]);
  const boxes = vatReturnBoxes({ outputVat: 2000, inputVat: 500, reverseChargeVat: 0 }, figures, 1450);
  assert.equal(box(boxes, "1"), 1740);
  assert.equal(box(boxes, "4"), 0);
});

test("BAS: G3 counts untaxed lines, G2 exports, G10 capital purchases with GST", () => {
  const figures = documentFigures([
    doc({
      subtotal: 3000,
      total: 3200,
      lines: [
        { amount: 2000, taxAmount: 200, capital: false },
        { amount: 1000, taxAmount: 0, capital: false },
      ],
    }),
    doc({ subtotal: 5000, total: 5000, crossBorder: true, lines: [{ amount: 5000, taxAmount: 0, capital: false }] }),
    doc({
      side: "purchase",
      subtotal: 4000,
      total: 4400,
      lines: [
        { amount: 3000, taxAmount: 300, capital: true },
        { amount: 1000, taxAmount: 100, capital: false },
      ],
    }),
  ]);
  const fields = basFields({ outputVat: 200, inputVat: 400, reverseChargeVat: 0 }, figures);
  const f = (name: string) => fields.find((x) => x.field === name)?.amount;
  assert.equal(f("G1"), 8200);
  assert.equal(f("G2"), 5000);
  assert.equal(f("G3"), 1000);
  assert.equal(f("G10"), 3300);
  assert.equal(f("G11"), 1100);
  assert.equal(f("NET"), -200);
});


test("compound tax splits a line's tax between its parts by rate", () => {
  const parts = [
    { rate: 500, accountId: null }, // GST 5% → default account
    { rate: 700, accountId: "pst" }, // PST 7% → its own account
  ];
  assert.equal(compoundRate(parts), 1200);
  assert.deepEqual(splitCompoundTax(1200, parts), [
    { accountId: null, amount: 500 },
    { accountId: "pst", amount: 700 },
  ]);
  const odd = splitCompoundTax(1001, parts);
  assert.equal(odd.reduce((s, p) => s + p.amount, 0), 1001);
  assert.deepEqual(splitCompoundTax(300, []), [{ accountId: null, amount: 300 }]);
});
