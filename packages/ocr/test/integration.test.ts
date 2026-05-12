// End-to-end test: render a realistic receipt to PNG and run the full scan()
// pipeline (preprocess on server is skipped, tesseract handles bytes directly).
// This is gated behind RUN_OCR_E2E=1 because it downloads ~5MB of language data
// the first time and takes ~10s.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { scan } from "../src/index";

const RUN = process.env.RUN_OCR_E2E === "1";

function receiptSvg(): string {
  // 600 x 1000 with high-contrast black text on white — Tesseract's best case.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000" viewBox="0 0 600 1000">
    <rect width="600" height="1000" fill="white"/>
    <style>
      .h { font: bold 36px monospace; }
      .b { font: 24px monospace; }
      .s { font: 20px monospace; }
    </style>
    <text x="300" y="60"  class="h" text-anchor="middle">ACME COFFEE</text>
    <text x="300" y="100" class="s" text-anchor="middle">123 Market Street</text>
    <text x="300" y="130" class="s" text-anchor="middle">San Francisco CA 94103</text>
    <text x="300" y="160" class="s" text-anchor="middle">(415) 555-0123</text>

    <line x1="40" y1="200" x2="560" y2="200" stroke="black" stroke-width="2"/>

    <text x="40"  y="240" class="b">Date: 2026-03-15</text>
    <text x="40"  y="275" class="b">Receipt #: A-10293</text>

    <line x1="40" y1="305" x2="560" y2="305" stroke="black" stroke-width="2"/>

    <text x="40"  y="345" class="b">Latte</text>
    <text x="560" y="345" class="b" text-anchor="end">5.50</text>
    <text x="40"  y="380" class="b">Bagel</text>
    <text x="560" y="380" class="b" text-anchor="end">3.25</text>
    <text x="40"  y="415" class="b">2 x Espresso</text>
    <text x="560" y="415" class="b" text-anchor="end">7.00</text>

    <line x1="40" y1="450" x2="560" y2="450" stroke="black" stroke-width="2"/>

    <text x="40"  y="490" class="b">Subtotal</text>
    <text x="560" y="490" class="b" text-anchor="end">15.75</text>
    <text x="40"  y="525" class="b">Tax 8.5%</text>
    <text x="560" y="525" class="b" text-anchor="end">1.34</text>
    <text x="40"  y="565" class="h">TOTAL</text>
    <text x="560" y="565" class="h" text-anchor="end">17.09</text>

    <line x1="40" y1="600" x2="560" y2="600" stroke="black" stroke-width="2"/>

    <text x="40"  y="640" class="b">Paid by VISA ****4242</text>
    <text x="40"  y="675" class="b">USD</text>

    <text x="300" y="740" class="s" text-anchor="middle">THANK YOU</text>
  </svg>`;
}

async function renderReceiptPng(): Promise<Uint8Array> {
  const buf = await sharp(Buffer.from(receiptSvg()))
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

test("integration: scan a clean synthetic receipt", { skip: !RUN }, async () => {
  const png = await renderReceiptPng();
  const r = await scan(png, { rawInput: true, locale: "en-US" });

  // Useful for debugging when this fails locally.
  if (process.env.OCR_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.log("RAW TEXT:\n", r.text);
    // eslint-disable-next-line no-console
    console.log("FIELDS:", JSON.stringify(r.fields, null, 2));
  }

  assert.ok(r.lines.length > 0, "expected at least one line");
  assert.equal(r.fields.vendor.value?.toLowerCase().includes("acme"), true, `vendor "${r.fields.vendor.value}" should contain "acme"`);
  assert.equal(r.fields.date.value, "2026-03-15");
  assert.equal(r.fields.total.value, 1709);
  assert.equal(r.fields.subtotal.value, 1575);
  assert.equal(r.fields.tax.value, 134);
  assert.equal(r.fields.taxRate.value, 8.5);
  assert.equal(r.fields.currency.value, "USD");
  assert.match(r.fields.paymentMethod.value ?? "", /Visa/i);
  assert.equal(r.fields.receiptNumber.value, "A-10293");
});
