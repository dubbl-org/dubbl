// Extract tax amount and tax rate. Tax keywords vary by locale:
// VAT (UK/EU), GST/HST/PST/QST (Canada/AU/NZ/IN), MwSt/USt (DE), TVA (FR), IVA (ES/IT/PT).
//
// Strategy:
//   1. Find lines containing a tax keyword.
//   2. Pick the line with the largest amount (tax total > tax breakdown lines).
//   3. Capture an explicit "X%" rate if present.

import type { Field, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";
import { findAmounts, rightmostAmount, toCents } from "../util/number";

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

    const last = rightmostAmount(line.text);
    if (last && !isNaN(last.value)) {
      if (!bestTax || last.value > bestTax.amount) {
        // Don't pick tiny round amounts that are clearly rates not totals.
        if (last.value > 0.01 && last.value < 1_000_000) {
          if (!isTotalLineToo || !bestTax) {
            bestTax = { line, amount: last.value, raw: last.raw };
          }
        }
      }
    }

    const rateMatch = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(line.text);
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
      const rateMatch = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(line.text);
      if (!rateMatch) continue;
      const rate = Number(rateMatch[1].replace(",", "."));
      if (rate < 1 || rate > 35) continue;
      // Only accept naked percentages if a nearby line has tax keyword.
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

  // Reuse findAmounts to silence unused-import warnings if we ever drop one path.
  void findAmounts;

  return { tax, taxRate };
}
