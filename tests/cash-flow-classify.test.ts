import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCashFlowAccount } from "../lib/reports/cash-flow";

const acct = (code: string, type: "asset" | "liability" | "equity" | "revenue" | "expense", subType: string | null, roles: string[] | null = null) =>
  classifyCashFlowAccount({ code, type, subType, roles });

test("standard chart accounts get the right cash-flow class", () => {
  assert.equal(acct("1100", "asset", "bank"), "cash");
  assert.equal(acct("1000", "asset", "current"), "cash");
  assert.equal(acct("1200", "asset", "current"), "receivables");
  assert.equal(acct("1300", "asset", "current"), "inventory");
  assert.equal(acct("1400", "asset", "current"), "workingCapital");
  assert.equal(acct("1620", "asset", "fixed"), "fixed");
  assert.equal(acct("1720", "asset", "fixed"), "fixed");
  assert.equal(acct("2100", "liability", "current"), "payables");
  assert.equal(acct("2200", "liability", "output_vat"), "workingCapital");
  assert.equal(acct("2500", "liability", "current"), "loan");
  assert.equal(acct("2700", "liability", "non_current"), "loan");
  assert.equal(acct("3000", "equity", "equity"), "equity");
  assert.equal(acct("4000", "revenue", "operating"), "profitAndLoss");
});

test("role-mapped charts are classified by role, not by their own code", () => {
  // Xero-style chart: receivables is 610 playing the 1200 role.
  assert.equal(acct("610", "asset", "current", ["1200"]), "receivables");
  assert.equal(acct("800", "liability", "current", ["2100"]), "payables");
  // A role-mapped account that happens to be numbered 1200 but plays nothing.
  assert.equal(acct("1200", "asset", "current", []), "workingCapital");
});

test("legacy explicit subTypes still work", () => {
  assert.equal(acct("9", "asset", "accounts_receivable"), "receivables");
  assert.equal(acct("9", "asset", "inventory"), "inventory");
  assert.equal(acct("9", "asset", "fixed_asset"), "fixed");
  assert.equal(acct("9", "liability", "accounts_payable"), "payables");
});
