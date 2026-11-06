import { test } from "node:test";
import assert from "node:assert/strict";
import { projectInvoiceRevenueAccount, withLineAccount } from "../lib/projects/rules";

test("project invoice lines use the client's default income account first", () => {
  assert.equal(projectInvoiceRevenueAccount("acct-client", "acct-sales"), "acct-client");
});

test("project invoice lines fall back to the Sales account", () => {
  assert.equal(projectInvoiceRevenueAccount(null, "acct-sales"), "acct-sales");
  assert.equal(projectInvoiceRevenueAccount(undefined, "acct-sales"), "acct-sales");
  assert.equal(projectInvoiceRevenueAccount("", "acct-sales"), "acct-sales");
});

test("no account at all is reported as null so creation can refuse", () => {
  assert.equal(projectInvoiceRevenueAccount(null, null), null);
  assert.equal(projectInvoiceRevenueAccount(undefined, undefined), null);
});

test("every kind of project line gets the account", () => {
  const lines = [
    { description: "Design", amount: 35000, kind: "time" },
    { description: "Milestone: Launch", amount: 500000, kind: "milestone" },
    { description: "Site - 50% of fixed price", amount: 750000, kind: "fixed" },
    { description: "Stock photos", amount: 12000, kind: "expense" },
  ];
  const out = withLineAccount(lines, "acct-sales");
  assert.equal(out.length, 4);
  for (const l of out) assert.equal(l.accountId, "acct-sales");
  assert.deepEqual(
    out.map((l) => [l.kind, l.amount]),
    lines.map((l) => [l.kind, l.amount])
  );
  // The input lines are not changed.
  assert.equal("accountId" in lines[0], false);
});
