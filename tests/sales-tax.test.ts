import { test } from "node:test";
import assert from "node:assert/strict";
import { salesTaxBreakdown } from "../lib/reports/sales-tax";

const std = { id: "r8", name: "Sales Tax 8%", rate: 800, kind: "standard" };

test("lines without a rate count only as exempt, never as taxable", () => {
  const r = salesTaxBreakdown([
    { invoiceId: "a", amount: 10000, taxAmount: 800, taxRate: std, contactTaxExempt: false },
    { invoiceId: "a", amount: 5000, taxAmount: 0, taxRate: null, contactTaxExempt: false },
  ]);
  assert.equal(r.totalTaxable, 10000);
  assert.equal(r.exemptAmount, 5000);
  assert.equal(r.totalCollected, 800);
  assert.equal(r.breakdown.length, 1);
  assert.equal(r.breakdown[0].invoiceCount, 1);
});

test("sales to a customer set to Don't charge tax are exempt", () => {
  const r = salesTaxBreakdown([
    { invoiceId: "b", amount: 20000, taxAmount: 0, taxRate: std, contactTaxExempt: true },
  ]);
  assert.equal(r.totalTaxable, 0);
  assert.equal(r.exemptAmount, 20000);
  assert.equal(r.exemptCustomerAmount, 20000);
});

test("tax actually charged is always reported", () => {
  const r = salesTaxBreakdown([
    { invoiceId: "c", amount: 20000, taxAmount: 1600, taxRate: std, contactTaxExempt: true },
  ]);
  assert.equal(r.totalCollected, 1600);
  assert.equal(r.exemptAmount, 0);
});

test("exempt-kind rates are exempt sales", () => {
  const r = salesTaxBreakdown([
    { invoiceId: "d", amount: 3000, taxAmount: 0, taxRate: { id: "x", name: "Exempt", rate: 0, kind: "exempt" }, contactTaxExempt: false },
  ]);
  assert.equal(r.exemptAmount, 3000);
  assert.equal(r.breakdown.length, 0);
});

test("credit notes count negative and net off the rate they reverse", () => {
  const r = salesTaxBreakdown([
    { invoiceId: "inv", amount: 10000, taxAmount: 800, taxRate: std, contactTaxExempt: false },
    { invoiceId: "receipt", amount: 5000, taxAmount: 400, taxRate: std, contactTaxExempt: false },
    { invoiceId: "credit", amount: -2000, taxAmount: -160, taxRate: std, contactTaxExempt: false },
  ]);
  assert.equal(r.totalTaxable, 13000);
  assert.equal(r.totalCollected, 1040);
  assert.equal(r.breakdown[0].invoiceCount, 3);
});
