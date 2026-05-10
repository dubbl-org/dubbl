// Extract tax amount and tax rate. Tax keywords vary by locale:
// VAT (UK/EU), GST/HST/PST/QST (Canada/AU/NZ/IN), MwSt/USt (DE), TVA (FR), IVA (ES/IT/PT).
//
// Strategy:
//   1. Find lines containing a tax keyword.
//   2. Pick the line with the largest amount (tax total > tax breakdown lines).
//   3. Capture an explicit "X%" rate if present.

import type { Field, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";
import { findAmounts, toCents } from "../util/number";

const RATE_RE = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;

/** Rightmost amount on a line that is NOT immediately followed by "%".
 *  Prevents "VAT 20% 4.00" from picking 20 as the tax amount. */
function rightmostNonRateAmount(text: string): { value: number; raw: string } | null {
  const all = findAmounts(text);
  for (let i = all.length - 1; i >= 0; i--) {
    const a = all[i];
    const after = text.slice(a.index + a.length, a.index + a.length + 2);
    if (/^\s*%/.test(after)) continue;
    return { value: a.value, raw: a.raw };
  }
  return null;
}

export function parseTax(
  lines: OcrLine[],
  locale?: Locale
): { tax: Field<number>; taxRate: Field<number> } {
  const kw = getMergedKeywords(locale);
  const taxRe = buildKeywordRegex(kw.tax);
  const totalRe = buildKeywordRegex(kw.total);

  let bestTax: { line: OcrLine; amount: number; raw: string } | null = null;
  let bestRate: { line: OcrLine; rate: number; raw: string } | null = null;

  for (const line of lines) {
    if (!taxRe.test(line.text)) continue;

    // Skip "TOTAL TAX" lines unless we have nothing else: they're a sum of other tax lines.
    const isTotalLineToo = totalRe.test(line.text);

    const last = rightmostNonRateAmount(line.text);
    if (last && isFinite(last.value)) {
      // Reject obviously-bogus amounts: tax rarely exceeds 1M, and 0.0 is meaningless.
      if (last.value > 0.01 && last.value < 1_000_000) {
        if (!bestTax || last.value > bestTax.amount) {
          if (!isTotalLineToo || !bestTax) {
            bestTax = { line, amount: last.value, raw: last.raw };
          }
        }
      }
    }

    const rateMatch = RATE_RE.exec(line.text);
    if (rateMatch) {
      const rate = Number(rateMatch[1].replace(",", "."));
      if (rate >= 0 && rate <= 35) {
        if (!bestRate || rate > bestRate.rate) {
          bestRate = { line, rate, raw: rateMatch[0] };
        }
      }
    }
  }

  // If we only have a rate but no amount, look for the rate in nearby lines too.
  if (!bestRate) {
    for (const line of lines) {
      const rateMatch = RATE_RE.exec(line.text);
      if (!rateMatch) continue;
      const rate = Number(rateMatch[1].replace(",", "."));
      if (rate < 1 || rate > 35) continue;
      bestRate = { line, rate, raw: rateMatch[0] };
      break;
    }
  }

  const tax: Field<number> = bestTax
    ? {
        value: toCents(bestTax.amount),
        raw: bestTax.raw,
        confidence: 0.75,
        bbox: [bestTax.line.bbox],
      }
    : { value: null, raw: null, confidence: 0, bbox: null };

  const taxRate: Field<number> = bestRate
    ? {
        value: bestRate.rate,
        raw: bestRate.raw,
        confidence: 0.8,
        bbox: [bestRate.line.bbox],
      }
    : { value: null, raw: null, confidence: 0, bbox: null };

  return { tax, taxRate };
}
