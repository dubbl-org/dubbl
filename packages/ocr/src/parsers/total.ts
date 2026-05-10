// Find the GRAND TOTAL of a receipt. Strategy:
//
// 1) Score each line by keyword presence and bias:
//    +1.0 if line has a "total" keyword
//    -1.5 if line ALSO contains a negative keyword ("subtotal", "tax total", "items total"...)
//    +0.3 if it's near the bottom of the receipt
//    +0.3 if its rightmost amount is the largest amount on the receipt overall
//    +0.2 if a currency symbol immediately precedes the amount
//
// 2) Take the rightmost amount on the best-scoring line.
//
// 3) Fallback: if no positive line survives, pick the largest amount in the
//    bottom third of the receipt that is not on a recognized "negative" line.

import type { Field, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";
import { findAmounts, rightmostAmount, toCents } from "../util/number";

interface TotalCandidate {
  line: OcrLine;
  amount: number;
  amountCents: number;
  score: number;
  raw: string;
  amountIndex: number;
  amountLength: number;
}

export function parseTotal(
  lines: OcrLine[],
  locale?: Locale
): { total: Field<number>; subtotal: Field<number> } {
  if (lines.length === 0) {
    return {
      total: { value: null, raw: null, confidence: 0, bbox: null },
      subtotal: { value: null, raw: null, confidence: 0, bbox: null },
    };
  }

  const kw = getMergedKeywords(locale);
  const totalRe = buildKeywordRegex(kw.total);
  const negativeRe = buildKeywordRegex(kw.totalNegative);
  const subtotalRe = buildKeywordRegex(kw.subtotal);
  const taxRe = buildKeywordRegex(kw.tax);

  const docTop = lines[0].bbox.y0;
  const docBot = lines[lines.length - 1].bbox.y1;
  const docH = Math.max(1, docBot - docTop);

  // Find largest amount overall as a tiebreaker.
  const allAmounts = lines.flatMap((l) => findAmounts(l.text).map((a) => a.value));
  const maxAmount = allAmounts.length ? Math.max(...allAmounts) : 0;

  const totalCandidates: TotalCandidate[] = [];
  const subtotalCandidates: TotalCandidate[] = [];

  for (const line of lines) {
    const yMid = (line.bbox.y0 + line.bbox.y1) / 2;
    const yPos = (yMid - docTop) / docH; // 0=top, 1=bottom
    const last = rightmostAmount(line.text);
    if (!last) continue;

    const lineText = line.text;
    const isTax = taxRe.test(lineText);
    const isSub = subtotalRe.test(lineText);
    const hasTotal = totalRe.test(lineText);
    const isNegative = negativeRe.test(lineText);

    // Subtotal candidate
    if (isSub && !isTax) {
      let score = 1.0;
      if (yPos < 0.85) score += 0.1;
      subtotalCandidates.push({
        line,
        amount: last.value,
        amountCents: toCents(last.value),
        raw: last.raw,
        amountIndex: last.index,
        amountLength: last.length,
        score,
      });
    }

    // Total candidate
    if (hasTotal) {
      let score = 1.0;
      if (isNegative) score -= 1.5;
      // Bias for bottom of receipt
      score += yPos * 0.6;
      // Bias for matching the receipt's largest amount
      if (maxAmount > 0 && Math.abs(last.value - maxAmount) < 0.01) score += 0.4;
      // Currency-symbol prefix is a small signal.
      const symPrefix = /[$€£¥]\s*[\d.,]+\s*$/.test(lineText);
      if (symPrefix) score += 0.15;

      totalCandidates.push({
        line,
        amount: last.value,
        amountCents: toCents(last.value),
        raw: last.raw,
        amountIndex: last.index,
        amountLength: last.length,
        score,
      });
    }
  }

  totalCandidates.sort((a, b) => b.score - a.score);
  subtotalCandidates.sort((a, b) => b.score - a.score);

  // Fallback for total.
  let totalField: Field<number>;
  if (totalCandidates.length > 0 && totalCandidates[0].score > 0) {
    const c = totalCandidates[0];
    totalField = {
      value: c.amountCents,
      raw: c.raw,
      confidence: clamp01(0.55 + Math.min(0.4, c.score * 0.2)),
      bbox: [c.line.bbox],
    };
  } else {
    // Largest amount in bottom third, on non-negative lines.
    const bottomCutoff = docTop + docH * 0.6;
    const fallback = lines
      .filter((l) => l.bbox.y0 >= bottomCutoff && !negativeRe.test(l.text))
      .flatMap((l) =>
        findAmounts(l.text).map((a) => ({ a, l }))
      )
      .sort((x, y) => y.a.value - x.a.value)[0];

    if (fallback) {
      totalField = {
        value: toCents(fallback.a.value),
        raw: fallback.a.raw,
        confidence: 0.4,
        bbox: [fallback.l.bbox],
      };
    } else {
      totalField = { value: null, raw: null, confidence: 0, bbox: null };
    }
  }

  const subtotalField: Field<number> =
    subtotalCandidates[0]
      ? {
          value: subtotalCandidates[0].amountCents,
          raw: subtotalCandidates[0].raw,
          confidence: 0.75,
          bbox: [subtotalCandidates[0].line.bbox],
        }
      : { value: null, raw: null, confidence: 0, bbox: null };

  return { total: totalField, subtotal: subtotalField };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
