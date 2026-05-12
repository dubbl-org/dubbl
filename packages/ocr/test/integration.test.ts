// End-to-end OCR tests against realistic synthetic receipts.
//
// Gated behind RUN_OCR_E2E=1 because the first run downloads ~5MB of
// language data (eng + deu) and a full scan takes 1–2s. The fixtures
// mirror real-world receipt formats we've seen: a US grocery thermal
// printout, a German discount supermarket, and the clean fixed-width
// receipt used by the original smoke test.
//
// All assertions are exact-value checks against the expected fields.
// When debugging locally, set OCR_DEBUG=1 to dump the recognized text
// and extracted fields.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { scan, shutdown } from "../src/index";
import type { ScanResult } from "../src/index";

const RUN = process.env.RUN_OCR_E2E === "1";
const DEBUG = process.env.OCR_DEBUG === "1";

function cleanReceiptSvg(): string {
  // 600x1000, high-contrast monospace — the original smoke fixture.
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

function thermalGroceryReceiptSvg(): string {
  // Long, narrow, smaller monospace text — mimics a Whole Foods / Trader
  // Joe's style thermal printout with full address, cashier, store ID, item
  // suffixes (F/T for food/taxable), and a masked card line.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="700" viewBox="0 0 380 700">
    <rect width="380" height="700" fill="#fafafa"/>
    <style>
      .h { font: bold 18px monospace; fill: #2a2a2a; }
      .b { font: 14px monospace; fill: #3a3a3a; }
      .s { font: 12px monospace; fill: #555; }
    </style>
    <text x="190" y="40"  class="h" text-anchor="middle">WHOLE FOODS MARKET</text>
    <text x="190" y="62"  class="s" text-anchor="middle">399 4TH ST, SAN FRANCISCO</text>
    <text x="190" y="80"  class="s" text-anchor="middle">CA 94107  (415) 618-0066</text>

    <text x="20"  y="120" class="b">03/15/26  14:23  Cashier: Mia</text>
    <text x="20"  y="140" class="s">Order #284571  Store: 10026</text>

    <text x="20"  y="180" class="b">365 OAT MILK 64OZ</text>
    <text x="360" y="180" class="b" text-anchor="end">4.99 F</text>
    <text x="20"  y="205" class="b">ORG BANANAS 1.32 LB</text>
    <text x="360" y="205" class="b" text-anchor="end">1.05 F</text>
    <text x="20"  y="230" class="b">SOURDOUGH BOULE</text>
    <text x="360" y="230" class="b" text-anchor="end">5.99 F</text>
    <text x="20"  y="255" class="b">2 X HAAS AVOCADO</text>
    <text x="360" y="255" class="b" text-anchor="end">3.98 F</text>
    <text x="20"  y="280" class="b">PAPER TOWEL 6PK</text>
    <text x="360" y="280" class="b" text-anchor="end">12.49 T</text>
    <text x="20"  y="305" class="b">SP TOPPED PIZZA</text>
    <text x="360" y="305" class="b" text-anchor="end">8.99 F</text>
    <text x="20"  y="330" class="b">KEFIR PLAIN 32OZ</text>
    <text x="360" y="330" class="b" text-anchor="end">4.49 F</text>

    <line x1="20" y1="355" x2="360" y2="355" stroke="#888" stroke-width="1"/>
    <text x="20"  y="380" class="b">Subtotal</text>
    <text x="360" y="380" class="b" text-anchor="end">41.98</text>
    <text x="20"  y="405" class="b">Sales Tax</text>
    <text x="360" y="405" class="b" text-anchor="end">1.09</text>
    <line x1="20" y1="420" x2="360" y2="420" stroke="#888" stroke-width="1"/>
    <text x="20"  y="450" class="h">TOTAL</text>
    <text x="360" y="450" class="h" text-anchor="end">$43.07</text>

    <text x="20"  y="490" class="b">VISA  ************4242</text>
    <text x="360" y="490" class="b" text-anchor="end">43.07</text>
    <text x="20"  y="510" class="s">AUTH 008251  CHIP</text>

    <text x="190" y="560" class="s" text-anchor="middle">Thank you for shopping!</text>
  </svg>`;
}

async function render(svg: string): Promise<Uint8Array> {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Uint8Array(buf);
}

function debug(name: string, r: ScanResult): void {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`\n[${name}] confidence=${r.overallConfidence.toFixed(3)} dur=${r.durationMs}ms`);
  // eslint-disable-next-line no-console
  console.log(`[${name}] text:\n${r.text}`);
  // eslint-disable-next-line no-console
  console.log(`[${name}] fields:`, JSON.stringify(r.fields, null, 2));
  if (r.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[${name}] warnings:`, r.warnings);
  }
}

test("integration: clean monospace receipt — exact values", { skip: !RUN }, async () => {
  const png = await render(cleanReceiptSvg());
  const r = await scan(png, { rawInput: true, locale: "en-US" });
  debug("clean", r);

  assert.ok(r.lines.length > 0, "expected at least one OCR line");
  assert.match(r.fields.vendor.value ?? "", /acme/i);
  assert.equal(r.fields.date.value, "2026-03-15");
  assert.equal(r.fields.total.value, 1709);
  assert.equal(r.fields.subtotal.value, 1575);
  assert.equal(r.fields.tax.value, 134);
  assert.equal(r.fields.taxRate.value, 8.5);
  assert.equal(r.fields.currency.value, "USD");
  assert.match(r.fields.paymentMethod.value ?? "", /visa/i);
  assert.equal(r.fields.receiptNumber.value, "A-10293");
});

test("integration: thermal grocery receipt — full field extraction", { skip: !RUN }, async () => {
  const png = await render(thermalGroceryReceiptSvg());
  const r = await scan(png, { rawInput: true, locale: "en-US" });
  debug("thermal", r);

  // Vendor / metadata
  assert.match(r.fields.vendor.value ?? "", /whole\s*foods/i, `vendor was "${r.fields.vendor.value}"`);
  assert.equal(r.fields.date.value, "2026-03-15");
  assert.equal(r.fields.currency.value, "USD");
  assert.match(r.fields.paymentMethod.value ?? "", /visa/i);
  assert.equal(r.fields.receiptNumber.value, "284571");

  // Money — this is the load-bearing part for an expense tracker.
  assert.equal(r.fields.total.value, 4307, `total was ${r.fields.total.value}`);
  assert.equal(r.fields.subtotal.value, 4198);
  assert.equal(r.fields.tax.value, 109);

  // Line items — should pull seven grocery items and skip the address /
  // cashier / order # lines. We don't pin descriptions because OCR can
  // legitimately misread "365 OAT MILK 64OZ" as "365 OAT MILK 640Z" etc.;
  // what matters is that the right COUNT and right AMOUNTS come out.
  const amounts = r.fields.lineItems.map((li) => li.amount.value).sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(amounts, [105, 398, 449, 499, 599, 899, 1249],
    `line item amounts were ${JSON.stringify(amounts)}`);

  // The "2 X HAAS AVOCADO" line should be picked up as qty=2.
  const avocado = r.fields.lineItems.find((li) => li.amount.value === 398);
  assert.ok(avocado, "expected an item with amount 3.98");
  assert.equal(avocado.quantity.value, 2, `avocado qty was ${avocado.quantity.value}`);

  // Sum of line items should equal the subtotal.
  const sum = r.fields.lineItems.reduce((a, li) => a + (li.amount.value ?? 0), 0);
  assert.equal(sum, 4198, `line item sum was ${sum}, expected 4198`);

  // Warnings should be empty when the math reconciles.
  assert.deepEqual(r.warnings, [], `unexpected warnings: ${JSON.stringify(r.warnings)}`);
});

function tabularInvoiceSvg(): string {
  // Mimics the standard "electronic receipt template" layout found all over
  // the web: four right-aligned columns [Description] [Qty] [Unit] [Amount].
  // Reproduces the user-reported failure mode where the description used to
  // swallow the qty + unit-price columns ("Electronic Products or Services
  // 3 100.00 300.00" → desc="Electronic Products or Services 3 100.00",
  // unit=300.00, amount=300.00).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="white"/>
    <style>
      .h  { font: bold 28px sans-serif; }
      .b  { font: 18px sans-serif; }
      .hh { font: bold 16px sans-serif; }
    </style>
    <text x="40"  y="60" class="h">INVOICE</text>
    <text x="760" y="60" class="b" text-anchor="end">Invoice #: INV-2026-0042</text>
    <text x="760" y="85" class="b" text-anchor="end">Date: 2026-04-08</text>

    <line x1="40" y1="120" x2="760" y2="120" stroke="black" stroke-width="2"/>
    <text x="40"  y="145" class="hh">Description</text>
    <text x="500" y="145" class="hh" text-anchor="end">Qty</text>
    <text x="630" y="145" class="hh" text-anchor="end">Unit Price</text>
    <text x="760" y="145" class="hh" text-anchor="end">Amount</text>
    <line x1="40" y1="160" x2="760" y2="160" stroke="black" stroke-width="1"/>

    <text x="40"  y="195" class="b">Electronic Products or Services</text>
    <text x="500" y="195" class="b" text-anchor="end">3</text>
    <text x="630" y="195" class="b" text-anchor="end">100.00</text>
    <text x="760" y="195" class="b" text-anchor="end">300.00</text>

    <text x="40"  y="225" class="b">Shipping and Handling</text>
    <text x="500" y="225" class="b" text-anchor="end">1</text>
    <text x="630" y="225" class="b" text-anchor="end">25.00</text>
    <text x="760" y="225" class="b" text-anchor="end">25.00</text>

    <text x="40"  y="255" class="b">Extended Warranty</text>
    <text x="500" y="255" class="b" text-anchor="end">2</text>
    <text x="630" y="255" class="b" text-anchor="end">49.99</text>
    <text x="760" y="255" class="b" text-anchor="end">99.98</text>

    <line x1="40" y1="285" x2="760" y2="285" stroke="black" stroke-width="1"/>
    <text x="500" y="320" class="b" text-anchor="end">Subtotal</text>
    <text x="760" y="320" class="b" text-anchor="end">424.98</text>
    <text x="500" y="345" class="b" text-anchor="end">Tax 7.5%</text>
    <text x="760" y="345" class="b" text-anchor="end">31.87</text>
    <text x="500" y="380" class="h" text-anchor="end">TOTAL</text>
    <text x="760" y="380" class="h" text-anchor="end">$456.85</text>

    <text x="40"  y="430" class="b">Paid by VISA ****1234</text>
  </svg>`;
}

test("integration: tabular invoice — qty/unit/amount columns", { skip: !RUN }, async () => {
  const png = await render(tabularInvoiceSvg());
  const r = await scan(png, { rawInput: true, locale: "en-US" });
  debug("invoice", r);

  assert.equal(r.fields.date.value, "2026-04-08");
  assert.equal(r.fields.total.value, 45685);
  assert.equal(r.fields.subtotal.value, 42498);
  assert.equal(r.fields.tax.value, 3187);
  assert.equal(r.fields.taxRate.value, 7.5);
  assert.match(r.fields.paymentMethod.value ?? "", /visa/i);

  assert.equal(r.fields.lineItems.length, 3, `got ${r.fields.lineItems.length} items`);

  const electronics = r.fields.lineItems.find((li) =>
    /electronic/i.test(li.description.value ?? "")
  );
  assert.ok(electronics, "expected an Electronic Products line item");
  assert.equal(electronics.quantity.value, 3, `qty was ${electronics.quantity.value}`);
  assert.equal(electronics.unitPrice.value, 10000, `unit was ${electronics.unitPrice.value}`);
  assert.equal(electronics.amount.value, 30000, `amount was ${electronics.amount.value}`);
  // Description should NOT swallow the qty/unit columns.
  assert.doesNotMatch(electronics.description.value ?? "", /\b3\b|\b100\.00\b/,
    `description leaked numeric columns: "${electronics.description.value}"`);

  const warranty = r.fields.lineItems.find((li) => li.amount.value === 9998);
  assert.ok(warranty, "expected an Extended Warranty line item");
  assert.equal(warranty.quantity.value, 2);
  assert.equal(warranty.unitPrice.value, 4999);

  const sum = r.fields.lineItems.reduce((a, li) => a + (li.amount.value ?? 0), 0);
  assert.equal(sum, 42498, `line item sum ${sum} should equal subtotal 42498`);
});

test.after(async () => {
  await shutdown();
});
