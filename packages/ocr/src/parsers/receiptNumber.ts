import type { Field, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";

const TAIL_RE = /(?:[#:]|number|no\.?|nr\.?)\s*([A-Z0-9][A-Z0-9\-_/]{2,})/i;
const STANDALONE_RE = /\b([A-Z]{0,3}-?\d{4,}[A-Z0-9\-]*)\b/;

export function parseReceiptNumber(lines: OcrLine[], locale?: Locale): Field<string> {
  const kw = getMergedKeywords(locale);
  const re = buildKeywordRegex(kw.receiptNumber);

  for (const line of lines) {
    if (!re.test(line.text)) continue;
    const tailMatch = TAIL_RE.exec(line.text);
    if (tailMatch) {
      return {
        value: tailMatch[1],
        raw: line.text,
        confidence: 0.85,
        bbox: [line.bbox],
      };
    }
    const standalone = STANDALONE_RE.exec(line.text);
    if (standalone) {
      return {
        value: standalone[1],
        raw: line.text,
        confidence: 0.7,
        bbox: [line.bbox],
      };
    }
  }

  return { value: null, raw: null, confidence: 0, bbox: null };
}
