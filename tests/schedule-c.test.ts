import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScheduleC, scheduleCLineFor } from "../lib/tax/schedule-c";
import { filingDeadline } from "../lib/tax/filing-deadline";

const acct = (code: string, name: string, type: string, subType: string | null, balance: number) => ({
  code,
  name,
  type,
  subType,
  balance,
});

test("standard chart accounts map to Schedule C lines", () => {
  assert.equal(scheduleCLineFor({ name: "Sales Revenue", type: "revenue", subType: "operating" }), "1");
  assert.equal(scheduleCLineFor({ name: "Interest Income", type: "revenue", subType: "non_operating" }), "6");
  assert.equal(scheduleCLineFor({ name: "Sales Returns", type: "revenue", subType: "operating" }), "2");
  assert.equal(scheduleCLineFor({ name: "Cost of Goods Sold", type: "expense", subType: "cogs" }), "4");
  assert.equal(scheduleCLineFor({ name: "Marketing & Advertising", type: "expense", subType: "operating" }), "8");
  assert.equal(scheduleCLineFor({ name: "Motor Vehicle & Fuel", type: "expense", subType: "operating" }), "9");
  assert.equal(scheduleCLineFor({ name: "Subcontractor Expense", type: "expense", subType: "operating" }), "11");
  assert.equal(scheduleCLineFor({ name: "Depreciation Expense", type: "expense", subType: "operating" }), "13");
  assert.equal(scheduleCLineFor({ name: "Employee Benefits", type: "expense", subType: "operating" }), "14");
  assert.equal(scheduleCLineFor({ name: "Insurance", type: "expense", subType: "operating" }), "15");
  assert.equal(scheduleCLineFor({ name: "Interest Expense", type: "expense", subType: "non_operating" }), "16b");
  assert.equal(scheduleCLineFor({ name: "Legal Fees", type: "expense", subType: "operating" }), "17");
  assert.equal(scheduleCLineFor({ name: "Office Supplies", type: "expense", subType: "operating" }), "18");
  assert.equal(scheduleCLineFor({ name: "Rent Expense", type: "expense", subType: "operating" }), "20b");
  assert.equal(scheduleCLineFor({ name: "Repairs & Maintenance", type: "expense", subType: "operating" }), "21");
  assert.equal(scheduleCLineFor({ name: "Payroll Tax", type: "expense", subType: "operating" }), "23");
  assert.equal(scheduleCLineFor({ name: "Travel Expense", type: "expense", subType: "operating" }), "24a");
  assert.equal(scheduleCLineFor({ name: "Meals & Entertainment", type: "expense", subType: "operating" }), "24b");
  assert.equal(scheduleCLineFor({ name: "Internet & Phone", type: "expense", subType: "operating" }), "25");
  assert.equal(scheduleCLineFor({ name: "Wages & Salaries", type: "expense", subType: "operating" }), "26");
  assert.equal(scheduleCLineFor({ name: "Bank Fees & Charges", type: "expense", subType: "operating" }), "27a");
  assert.equal(scheduleCLineFor({ name: "Income Tax Expense", type: "expense", subType: "non_operating" }), null);
  assert.equal(scheduleCLineFor({ name: "Gain on Asset Disposal", type: "revenue", subType: "non_operating" }), null);
  assert.equal(scheduleCLineFor({ name: "Anything", type: "expense", subType: "advertising" }), "8");
});

test("Line 3 subtracts returns and the totals add up", () => {
  const r = buildScheduleC([
    acct("4000", "Sales Revenue", "revenue", "operating", 100000),
    acct("4050", "Sales Returns", "revenue", "operating", -5000), // debit balance
    acct("4100", "Interest Income", "revenue", "non_operating", 1000),
    acct("5000", "Cost of Goods Sold", "expense", "cogs", 30000),
    acct("5600", "Marketing & Advertising", "expense", "operating", 4000),
    acct("5100", "Wages & Salaries", "expense", "operating", 20000),
    acct("8200", "Income Tax Expense", "expense", "non_operating", 9999),
  ]);
  const line = (n: string) => r.lines.find((l) => l.line === n)?.amount;
  assert.equal(line("1"), 100000);
  assert.equal(line("2"), 5000);
  assert.equal(line("3"), 95000);
  assert.equal(line("5"), 65000);
  assert.equal(line("7"), 66000);
  assert.equal(line("28"), 24000);
  assert.equal(line("31"), 42000);
  assert.equal(r.totalIncome, 66000);
  assert.equal(r.totalExpenses, 24000);
  assert.equal(r.netProfit, 42000);
});

test("filing deadlines follow the country's rules", () => {
  assert.equal(filingDeadline("2026-03-31", "GB", "quarterly"), "2026-05-07");
  assert.equal(filingDeadline("2026-12-31", "GB", "quarterly"), "2027-02-07");
  assert.equal(filingDeadline("2026-09-30", "AU", "quarterly"), "2026-10-28");
  assert.equal(filingDeadline("2026-12-31", "AU", "quarterly"), "2027-02-28");
  assert.equal(filingDeadline("2026-07-31", "AU", "monthly"), "2026-08-21");
  assert.equal(filingDeadline("2026-06-30", "AU", "annual"), "2027-02-28");
  assert.equal(filingDeadline("2026-03-31", "US", "quarterly"), "2026-04-20");
  assert.equal(filingDeadline("2026-11-30", "DE", "monthly"), "2026-12-31");
  assert.equal(filingDeadline("2026-12-31", null, "monthly"), "2027-01-31");
});

test("US sales tax goes to Sales Tax Payable", async () => {
  const { isUsSalesTax } = await import("../lib/api/journal-automation");
  assert.equal(isUsSalesTax({ taxRegime: "us_sales_tax", countryCode: "US" }), true);
  assert.equal(isUsSalesTax({ taxRegime: null, countryCode: "US" }), true);
  assert.equal(isUsSalesTax({ taxRegime: "vat", countryCode: "US" }), false);
  assert.equal(isUsSalesTax({ taxRegime: "vat", countryCode: "GB" }, "sales_tax_us"), true);
  assert.equal(isUsSalesTax({ taxRegime: null, countryCode: "GB" }), false);
  assert.equal(isUsSalesTax(null), false);
});
