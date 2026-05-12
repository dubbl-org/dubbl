// Extract line items from a receipt body. Receipts are "[description] ... [price]"
// per line, sometimes with quantities like "2 x" or "2 @ 5.99 = 11.98".
//
// Algorithm:
//   - Skip header lines (above the first numeric line) and footer lines (after
//     the line that contains the grand total).
//   - For each remaining line, treat the rightmost amount as the line total.
//   - Strip the amount from the description; pull out leading "qty x" if present.
//   - Drop lines that look like subtotal/tax/discount markers, addresses, phone
//     numbers, dates, receipt numbers, or other non-item header/footer noise.

import type { LineItem, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";
import { rightmostAmount, parseAmount, toCents } from "../util/number";

const QTY_RE = /^(\d{1,3})\s*(?:x|×|\*|@)\s*([\d.,]+)?\s*[-–]?\s*/i;
const QTY_TRAILING_RE = /(\d{1,3})\s*(?:x|×|\*|@)\s*([\d.,]+)/i;

// Patterns that strongly indicate a line is NOT a line item: dates, phones,
// URLs, addresses, zip codes, receipt/invoice numbers. We see these constantly
// on receipt headers and footers, and they happen to contain digit runs that
// look like amounts (zip "94103", phone "-0123", date "-15" tail, etc).
const NON_ITEM_PATTERNS: RegExp[] = [
  /\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/, // ISO date 2026-03-15
  /\b\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\b/, // US/EU date 03/15/2026
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/, // time 13:45
  /\b(?:tel|phone|fax|mobile|cell)\b[.: ]/i,
  /\(\d{2,4}\)\s*\d/, // (415) 555-0123
  /\b\d{3}[\s.-]\d{3}[\s.-]\d{3,4}\b/, // 415-555-0123
  /https?:\/\//i,
  /\bwww\./i,
  /\b\d{5}(?:-\d{4})?\s*$/, // trailing US zip code
  /\b(street|st\.|road|rd\.|avenue|ave\.|blvd|drive|dr\.|lane|ln\.|way|highway|hwy|suite|ste|floor|fl\.)\b/i,
  /^[A-Z]{2}\s+\d{4,5}/, // "CA 94103" state + zip prefix
  /\b(?:date|receipt|invoice|order|trans(?:action)?|ref(?:erence)?)\s*[#:]/i,
  /\bcard\s*#?\s*\*+\s*\d/i, // card number ****1234
  /\b\d{4,}\s*$/, // line ending in a 4+ digit integer chunk (no decimal)
];

// A money amount must look like money: at least one decimal separator with
// 2 or 3 trailing digits. Receipts virtually always price items as X.XX.
// This single check excludes the bulk of header/footer noise (zip codes,
// phone digit runs, dates).
const PRICE_SHAPE = /[.,]\d{2,3}\b/;

export function parseLineItems(
  lines: OcrLine[],
  locale?: Locale,
  totalLineY?: number
): LineItem[] {
  if (lines.length === 0) return [];
  const kw = getMergedKeywords(locale);
  const skipRe = buildKeywordRegex([
    ...kw.totalNegative,
    ...kw.total,
    ...kw.tax,
    ...kw.subtotal,
    ...kw.paymentMethod,
    ...kw.paymentLiterals,
    ...kw.date,
    ...kw.receiptNumber,
  ]);

  const items: LineItem[] = [];

  for (const line of lines) {
    if (totalLineY !== undefined && line.bbox.y0 >= totalLineY) break;

    const text = line.text.trim();
    if (text.length < 3) continue;
    if (skipRe.test(text)) continue;
    if (NON_ITEM_PATTERNS.some((re) => re.test(text))) continue;

    const last = rightmostAmount(text);
    if (!last) continue;

    // Amount must look like money (X.XX). Pure integer "amounts" on a receipt
    // are virtually never line items — they're zip codes, phone digits, etc.
    if (!PRICE_SHAPE.test(last.raw)) continue;

    // Reject implausible amounts. Receipts rarely have line items above
    // $100k; anything bigger is almost certainly a misread.
    if (Math.abs(last.value) > 100000) continue;

    // Description = everything before the rightmost amount, minus trailing dots/separators.
    let desc = text.slice(0, last.index).replace(/[\s.\-:]+$/, "").trim();
    if (desc.length < 2) continue;
    if (/^\d+$/.test(desc)) continue; // pure-number "description" is noise
    // Must contain at least one letter — pure punctuation/numbers can't be an item name.
    if (!/[A-Za-zÀ-ÿ]/.test(desc)) continue;

    let qty = 1;
    let unitPrice: number | null = null;

    const leadingQty = QTY_RE.exec(desc);
    if (leadingQty) {
      qty = Number(leadingQty[1]);
      if (leadingQty[2]) unitPrice = parseAmount(leadingQty[2]);
      desc = desc.slice(leadingQty[0].length).trim();
    } else {
      const trailingQty = QTY_TRAILING_RE.exec(desc);
      if (trailingQty) {
        qty = Number(trailingQty[1]);
        unitPrice = parseAmount(trailingQty[2]);
      }
    }

    if (unitPrice == null && qty > 0 && last.value > 0) {
      unitPrice = +(last.value / qty).toFixed(2);
    }

    items.push({
      description: { value: desc, raw: text, confidence: 0.6, bbox: [line.bbox] },
      quantity: { value: qty, raw: null, confidence: qty === 1 ? 0.4 : 0.8, bbox: null },
      unitPrice: {
        value: unitPrice != null ? toCents(unitPrice) : null,
        raw: null,
        confidence: unitPrice != null ? 0.6 : 0,
        bbox: null,
      },
      amount: {
        value: toCents(last.value),
        raw: last.raw,
        confidence: 0.7,
        bbox: [line.bbox],
      },
    });
  }

  return items;
}
