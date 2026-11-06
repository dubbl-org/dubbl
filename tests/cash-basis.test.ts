import { test } from "node:test";
import assert from "node:assert/strict";
import { CASH_REALISED_DOCUMENT_TYPES, realiseDocument, realisedFraction, splitProportional } from "../lib/reports/cash-basis";

// Invoice: $100 income + $20 VAT, DR receivables $120.
const invoiceLines = [
  { id: "ar", debit: 12000, credit: 0 },
  { id: "income", debit: 0, credit: 10000 },
  { id: "vat", debit: 0, credit: 2000 },
];

const sides = (lines: { debit: number; credit: number }[]) => ({
  d: lines.reduce((s, l) => s + l.debit, 0),
  c: lines.reduce((s, l) => s + l.credit, 0),
});

test("splitProportional sums exactly to the target", () => {
  assert.deepEqual(splitProportional([1, 1, 1], 100), [34, 33, 33]);
  assert.deepEqual(splitProportional([10000, 2000], 6000), [5000, 1000]);
  assert.deepEqual(splitProportional([0, 0], 50), [0, 0]);
  const parts = splitProportional([333, 333, 334], 1001);
  assert.equal(parts.reduce((s, p) => s + p, 0), 1001);
});

test("unpaid invoice realises nothing", () => {
  assert.deepEqual(realiseDocument(invoiceLines, 12000, []), []);
});

test("fully paid invoice realises the whole entry on the payment date", () => {
  const slices = realiseDocument(invoiceLines, 12000, [{ id: "p1", date: "2026-03-10", amount: 12000 }]);
  assert.equal(slices.length, 1);
  assert.equal(slices[0].settlement.date, "2026-03-10");
  assert.equal(slices[0].fraction, 1);
  assert.deepEqual(
    slices[0].lines.map((l) => [l.id, l.debit, l.credit]),
    [["ar", 12000, 0], ["income", 0, 10000], ["vat", 0, 2000]]
  );
});

test("part payments realise income and VAT pro rata, each slice balanced", () => {
  const slices = realiseDocument(invoiceLines, 12000, [
    { id: "p2", date: "2026-04-02", amount: 6000 },
    { id: "p1", date: "2026-03-10", amount: 6000 },
  ]);
  assert.deepEqual(slices.map((s) => s.settlement.id), ["p1", "p2"]);
  for (const s of slices) {
    const { d, c } = sides(s.lines);
    assert.equal(d, c);
    assert.equal(s.lines.find((l) => l.id === "income")?.credit, 5000);
    assert.equal(s.lines.find((l) => l.id === "vat")?.credit, 1000);
  }
});

test("awkward thirds still add up to the whole entry", () => {
  const lines = [
    { id: "ar", debit: 10001, credit: 0 },
    { id: "a", debit: 0, credit: 3334 },
    { id: "b", debit: 0, credit: 3334 },
    { id: "vat", debit: 0, credit: 3333 },
  ];
  const slices = realiseDocument(lines, 10001, [
    { id: "1", date: "2026-01-01", amount: 3333 },
    { id: "2", date: "2026-02-01", amount: 3333 },
    { id: "3", date: "2026-03-01", amount: 3335 },
  ]);
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const s of slices) {
    const { d, c } = sides(s.lines);
    assert.equal(d, c, "each slice balances");
    for (const l of s.lines) {
      const t = totals.get(l.id) ?? { debit: 0, credit: 0 };
      t.debit += l.debit;
      t.credit += l.credit;
      totals.set(l.id, t);
    }
  }
  for (const l of lines) assert.deepEqual(totals.get(l.id), { debit: l.debit, credit: l.credit });
});

test("overpayment realises no more than the document", () => {
  const slices = realiseDocument(invoiceLines, 12000, [
    { id: "1", date: "2026-01-01", amount: 10000 },
    { id: "2", date: "2026-01-05", amount: 5000 },
    { id: "3", date: "2026-01-09", amount: 100 },
  ]);
  assert.equal(slices.length, 2);
  const income = slices.reduce((s, x) => s + (x.lines.find((l) => l.id === "income")?.credit ?? 0), 0);
  assert.equal(income, 10000);
});

test("foreign-currency document: settlement ratio applies to base-currency lines", () => {
  // EUR 1,000 invoice booked at 1.10 → 110,000 base cents; half paid.
  const lines = [
    { id: "ar", debit: 110000, credit: 0 },
    { id: "income", debit: 0, credit: 110000 },
  ];
  const [slice] = realiseDocument(lines, 100000, [{ id: "1", date: "2026-05-01", amount: 50000 }]);
  assert.equal(slice.lines.find((l) => l.id === "income")?.credit, 55000);
});

test("realisedFraction counts only settlements in the window", () => {
  const settlements = [
    { id: "1", date: "2026-03-10", amount: 3000 },
    { id: "2", date: "2026-04-02", amount: 6000 },
    { id: "3", date: "2026-05-20", amount: 3000 },
  ];
  assert.equal(realisedFraction(12000, settlements, "2026-04-01", "2026-04-30"), 0.5);
  assert.equal(realisedFraction(12000, settlements, undefined, "2026-04-30"), 0.75);
  assert.equal(realisedFraction(12000, settlements, "2026-06-01", "2026-06-30"), 0);
});

test("a debit note applied to a bill takes its share of the cost back out on the cash basis", () => {
  assert.ok((CASH_REALISED_DOCUMENT_TYPES as readonly string[]).includes("debit_note"));
  // Bill: $100 cost + $20 VAT, CR payables $120.
  const billLines = [
    { id: "cost", debit: 10000, credit: 0 },
    { id: "vat", debit: 2000, credit: 0 },
    { id: "ap", debit: 0, credit: 12000 },
  ];
  // Debit note: $20 cost + $4 VAT back, DR payables $24.
  const dnLines = [
    { id: "ap", debit: 2400, credit: 0 },
    { id: "cost", debit: 0, credit: 2000 },
    { id: "vat", debit: 0, credit: 400 },
  ];
  // March 5: the $24 debit note is applied to the bill. April 2: the rest ($96) is paid.
  const billSlices = realiseDocument(billLines, 12000, [
    { id: "carrier", date: "2026-03-05", amount: 2400 },
    { id: "pay", date: "2026-04-02", amount: 9600 },
  ]);
  const dnSlices = realiseDocument(dnLines, 2400, [{ id: "dn", date: "2026-03-05", amount: 2400 }]);

  const net = (date: string, id: string) => {
    let n = 0;
    for (const s of [...billSlices, ...dnSlices]) {
      if (s.settlement.date !== date) continue;
      for (const l of s.lines) if (l.id === id) n += l.debit - l.credit;
    }
    return n;
  };
  // March: the applied credit realises $20 of bill cost and the debit note takes $20 out.
  assert.equal(net("2026-03-05", "cost"), 0);
  assert.equal(net("2026-03-05", "vat"), 0);
  assert.equal(net("2026-03-05", "ap"), 0);
  // April: the cash payment realises the remaining $80 cost and $16 VAT.
  assert.equal(net("2026-04-02", "cost"), 8000);
  assert.equal(net("2026-04-02", "vat"), 1600);
  for (const s of [...billSlices, ...dnSlices]) {
    const t = sides(s.lines);
    assert.equal(t.d, t.c);
  }
});
