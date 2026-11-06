import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultsToUnset,
  htmlToPlainText,
  paymentTermsText,
  safeAccentColor,
  templateBlockText,
} from "../lib/documents/template-text";

// --- exactly one default per type ---

const templates = [
  { id: "a", type: "invoice", isDefault: true },
  { id: "b", type: "invoice", isDefault: false },
  { id: "c", type: "quote", isDefault: true },
  { id: "d", type: "invoice", isDefault: true }, // legacy duplicate default
];

test("making an existing template default unsets every other default of its type", () => {
  assert.deepEqual(defaultsToUnset(templates, { id: "b", type: "invoice", isDefault: true }), ["a", "d"]);
});

test("a new default (no id yet) takes over from the old one", () => {
  assert.deepEqual(defaultsToUnset(templates, { type: "quote", isDefault: true }), ["c"]);
});

test("re-saving the current default never unsets itself", () => {
  assert.deepEqual(defaultsToUnset(templates, { id: "c", type: "quote", isDefault: true }), []);
});

test("saving without turning default on changes nothing", () => {
  assert.deepEqual(defaultsToUnset(templates, { id: "b", type: "invoice", isDefault: false }), []);
  assert.deepEqual(defaultsToUnset(templates, { id: "b", type: "invoice" }), []);
});

test("other types are left alone", () => {
  assert.deepEqual(defaultsToUnset(templates, { type: "payslip", isDefault: true }), []);
});

// --- header/footer HTML to safe text ---

test("keeps paragraphs, line breaks and list items as lines", () => {
  const html = '<p style="color:red">Acme Ltd</p><p>VAT GB123<br/>Reg 0456</p><ul><li>One</li><li>Two</li></ul>';
  assert.equal(htmlToPlainText(html), "Acme Ltd\n\nVAT GB123\nReg 0456\n\n• One\n• Two");
});

test("drops scripts and styles with their content and decodes entities", () => {
  const html = "<script>alert(1)</script><style>p{}</style><b>Tom &amp; Jerry&nbsp;&copy; 2026 &#8364;5</b>";
  assert.equal(htmlToPlainText(html), "Tom & Jerry © 2026 €5");
});

test("never lets markup through", () => {
  const out = htmlToPlainText('<img src=x onerror="alert(1)">Hi <a href="javascript:x">there</a> <unclosed');
  assert.ok(!out.includes("<"), out);
  assert.equal(out, "Hi there unclosed");
});

test("plain text is returned unchanged apart from trimming", () => {
  assert.equal(htmlToPlainText("  Thanks for your business  "), "Thanks for your business");
});

test("templateBlockText fills placeholders before stripping tags", () => {
  assert.equal(
    templateBlockText("<p>Invoice {{invoiceNumber}}</p><p>{{unknown}}</p>", { invoiceNumber: "INV-7" }),
    "Invoice INV-7\n\n{{unknown}}"
  );
  assert.equal(templateBlockText("<p> </p>", {}), null);
  assert.equal(templateBlockText(null, {}), null);
});

// --- payment terms line ---

test("payment terms line shows net days and the due date", () => {
  assert.equal(paymentTermsText("2026-03-10", "2026-04-09"), "Net 30. Please pay by 2026-04-09.");
  assert.equal(paymentTermsText("2026-03-10", "2026-03-10"), "Due on receipt.");
  assert.equal(paymentTermsText("2026-03-10", null), null);
});

// --- accent colour ---

test("accent colour only accepts hex colours", () => {
  assert.equal(safeAccentColor("#3b82f6"), "#3b82f6");
  assert.equal(safeAccentColor("#fff"), "#fff");
  assert.equal(safeAccentColor('red;"><script>'), "#10b981");
  assert.equal(safeAccentColor(null), "#10b981");
});
