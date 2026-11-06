import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentTermsCodeToDays, resolveTermsDays } from "../lib/payment-terms";
import { parseCsv, parseCsvObjects, groupRowsByKey, describeRows } from "../lib/import-export/csv-parse";
import { renderTemplate } from "../lib/email/template-engine";
import { applyContactDefaults } from "../lib/contact-defaults";

test("paymentTermsCodeToDays reads org terms codes", () => {
  assert.equal(paymentTermsCodeToDays("net_30"), 30);
  assert.equal(paymentTermsCodeToDays("net_7"), 7);
  assert.equal(paymentTermsCodeToDays("due_on_receipt"), 0);
  assert.equal(paymentTermsCodeToDays("14"), 14);
  assert.equal(paymentTermsCodeToDays(""), null);
  assert.equal(paymentTermsCodeToDays(null), null);
  assert.equal(paymentTermsCodeToDays("whenever"), null);
});

test("resolveTermsDays: contact terms, else org default, else 30", () => {
  assert.equal(resolveTermsDays(14, "net_60"), 14);
  assert.equal(resolveTermsDays(0, "net_60"), 0); // due on receipt is kept
  assert.equal(resolveTermsDays(null, "net_60"), 60);
  assert.equal(resolveTermsDays(undefined, "due_on_receipt"), 0);
  assert.equal(resolveTermsDays(null, null), 30);
  assert.equal(resolveTermsDays(null, "bogus"), 30);
});

test("parseCsv handles quoted commas, doubled quotes and line breaks", () => {
  const text = 'name,notes,amount\n"Acme, Inc.","He said ""hi""\nand left",1250.00\nBob,,5\n';
  assert.deepEqual(parseCsv(text), [
    ["name", "notes", "amount"],
    ["Acme, Inc.", 'He said "hi"\nand left', "1250.00"],
    ["Bob", "", "5"],
  ]);
});

test("parseCsv drops a BOM, accepts CRLF and skips blank lines", () => {
  const text = "﻿a,b\r\n1,2\r\n\r\n3,4";
  assert.deepEqual(parseCsv(text), [["a", "b"], ["1", "2"], ["3", "4"]]);
});

test("parseCsv detects semicolon and tab separated files", () => {
  assert.deepEqual(parseCsv("a;b\n1,5;2"), [["a", "b"], ["1,5", "2"]]);
  assert.deepEqual(parseCsv("a\tb\nx\ty"), [["a", "b"], ["x", "y"]]);
});

test("parseCsvObjects keys rows by header and fills missing fields", () => {
  const { headers, rows } = parseCsvObjects('Contact,Amount,Ref\n"Smith, J",10\n');
  assert.deepEqual(headers, ["Contact", "Amount", "Ref"]);
  assert.deepEqual(rows, [{ Contact: "Smith, J", Amount: "10", Ref: "" }]);
});

test("groupRowsByKey groups invoice lines and keeps row numbers", () => {
  const rows = [{ n: "INV-1" }, { n: "INV-2" }, { n: "INV-1" }, { n: "" }];
  const groups = groupRowsByKey(rows, (r) => r.n, [2, 3, 5, 6]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].rowNumbers, [2, 5]);
  assert.equal(groups[0].key, "INV-1");
  assert.deepEqual(groups[2].rowNumbers, [6]);
  assert.equal(groups[2].key, "row 6");
});

test("describeRows", () => {
  assert.equal(describeRows([4]), "Row 4");
  assert.equal(describeRows([4, 5, 6]), "Rows 4-6");
  assert.equal(describeRows([4, 7]), "Rows 4, 7");
});

test("renderTemplate fills placeholders and common aliases", () => {
  const vars = { contactName: "Acme", documentNumber: "INV-7", amountDue: "$12.50", organizationName: "Dubbl Co" };
  assert.equal(
    renderTemplate("Hi {{ customerName }}, {{invoiceNumber}} for {{amount}} from {{orgName}}", vars),
    "Hi Acme, INV-7 for $12.50 from Dubbl Co"
  );
  assert.equal(renderTemplate("{{contactName}} {{unknownThing}}", vars), "Acme {{unknownThing}}");
});

test("applyContactDefaults fills blanks and keeps choices", () => {
  const defaults = { revenueAccountId: "rev", expenseAccountId: "exp", taxRateId: "vat", isTaxExempt: false };
  const out = applyContactDefaults(
    [
      { accountId: null, taxRateId: undefined },
      { accountId: "mine", taxRateId: null }, // explicit "no tax" stays
      { accountId: "", taxRateId: "other" },
    ],
    defaults,
    "sales"
  );
  assert.deepEqual(out, [
    { accountId: "rev", taxRateId: "vat" },
    { accountId: "mine", taxRateId: null },
    { accountId: "rev", taxRateId: "other" },
  ]);
  const bill = applyContactDefaults([{ accountId: null, taxRateId: undefined }], defaults, "purchase");
  assert.equal(bill[0].accountId, "exp");
});

test("applyContactDefaults: Don't charge tax removes tax on sales only", () => {
  const defaults = { revenueAccountId: null, expenseAccountId: null, taxRateId: "vat", isTaxExempt: true };
  const sales = applyContactDefaults([{ accountId: "a", taxRateId: "vat" }], defaults, "sales");
  assert.equal(sales[0].taxRateId, null);
  const purchase = applyContactDefaults([{ accountId: "a", taxRateId: "vat" }], defaults, "purchase");
  assert.equal(purchase[0].taxRateId, "vat");
  assert.deepEqual(applyContactDefaults([{ accountId: "x" }], null, "sales"), [{ accountId: "x" }]);
});
