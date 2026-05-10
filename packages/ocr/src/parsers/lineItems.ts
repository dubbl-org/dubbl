// Extract line items from a receipt body. Receipts are "[description] ... [price]"
// per line, sometimes with quantities like "2 x" or "2 @ 5.99 = 11.98".
//
// Algorithm:
//   - Skip header lines (above the first numeric line) and footer lines (after
//     the line that contains the grand total).
//   - For each remaining line, treat the rightmost amount as the line total.
//   - Strip the amount from the description; pull out leading "qty x" if present.
//   - Drop lines that look like subtotal/tax/discount markers.

import type { LineItem, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";
import { rightmostAmount, parseAmount, toCents } from "../util/number";

const QTY_RE = /^(\d{1,3})\s*(?:x|×|\*|@)\s*([\d.,]+)?\s*[-–]?\s*/i;
const QTY_TRAILING_RE = /(\d{1,3})\s*(?:x|×|\*|@)\s*([\d.,]+)/i;

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
  ]);

  const items: LineItem[] = [];

  for (const line of lines) {
    if (totalLineY !== undefined && line.bbox.y0 >= totalLineY) break;

    const text = line.text.trim();
    if (text.length < 3) continue;
    if (skipRe.test(text)) continue;

    const last = rightmostAmount(text);
    if (!last) continue;

    // Description = everything before the rightmost amount, minus trailing dots/separators.
    let desc = text.slice(0, last.index).replace(/[\s.\-:]+$/, "").trim();
    if (desc.length < 2) continue;
    if (/^\d+$/.test(desc)) continue; // pure-number "description" is noise

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
