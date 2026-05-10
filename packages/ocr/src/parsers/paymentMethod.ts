// Detect the payment method line. Receipts use "VISA ****1234", "PAID BY CASH",
// "MASTERCARD CHIP", etc.

import type { Field, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";

export function parsePaymentMethod(lines: OcrLine[], locale?: Locale): Field<string> {
  const kw = getMergedKeywords(locale);
  const literalRe = buildKeywordRegex(kw.paymentLiterals);
  const phraseRe = buildKeywordRegex(kw.paymentMethod);

  for (const line of lines) {
    if (phraseRe.test(line.text)) {
      // Look for a payment literal on the same line; otherwise return the line.
      const m = literalRe.exec(line.text);
      if (m) {
        return {
          value: titleCase(m[0]),
          raw: line.text,
          confidence: 0.85,
          bbox: [line.bbox],
        };
      }
      return {
        value: line.text.trim(),
        raw: line.text,
        confidence: 0.6,
        bbox: [line.bbox],
      };
    }
  }

  // Fallback: a line that contains a card brand + masked digits "****1234".
  for (const line of lines) {
    const m = literalRe.exec(line.text);
    if (m) {
      const masked = /[*xX•·]{2,}\s?\d{2,4}|ending\s+in\s+\d{2,4}/i.exec(line.text);
      const conf = masked ? 0.9 : 0.7;
      return {
        value: titleCase(m[0]) + (masked ? ` ${masked[0]}` : ""),
        raw: line.text,
        confidence: conf,
        bbox: [line.bbox],
      };
    }
  }

  return { value: null, raw: null, confidence: 0, bbox: null };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
