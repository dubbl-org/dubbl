// Find the merchant/vendor name. On a receipt this is almost always in the top
// 3-5 lines. Heuristics:
//   - Skip lines that look like address (numbers + street/road/ave/etc.)
//   - Skip phone numbers, URLs, "RECEIPT", "INVOICE", date/time
//   - Prefer lines with mostly capital letters and no digits
//   - Prefer the LARGEST text height (vendors often print their name big)

import type { Field, OcrLine } from "../types";

const STOPWORDS = [
  /^receipt$/i,
  /^invoice$/i,
  /^tax\s+invoice$/i,
  /^bill$/i,
  /^thank\s+you/i,
  /^welcome\s+to/i,
  /^store\s*#?\s*\d+/i,
  /^\d+/, // starts with a number (often address)
  /^\(?\d{2,4}[\s)\-]+\d{2,4}/, // phone
  /https?:\/\//i,
  /\bwww\./i,
  /\.(com|net|org|co|io|de|fr|uk|au)\b/i,
  /^vat\s*(no|number|reg)/i,
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/, // dates
];

const STREET_RE = /\b(street|st\.|road|rd\.|avenue|ave\.|blvd|drive|dr\.|lane|ln\.|way|highway|hwy|suite|ste|floor|fl\.)\b/i;

export function parseVendor(lines: OcrLine[]): Field<string> {
  if (lines.length === 0) return { value: null, raw: null, confidence: 0, bbox: null };

  const top = lines.slice(0, Math.min(8, lines.length));

  type Cand = { line: OcrLine; score: number };
  const cands: Cand[] = [];

  for (let i = 0; i < top.length; i++) {
    const line = top[i];
    const text = line.text.trim();
    if (text.length < 2) continue;
    if (STOPWORDS.some((re) => re.test(text))) continue;
    if (STREET_RE.test(text)) continue;

    let score = 1 - i * 0.1; // prefer earlier lines

    const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    const digits = (text.match(/\d/g) || []).length;
    if (letters === 0) continue;
    if (digits / Math.max(1, text.length) > 0.4) continue;

    const upperRatio =
      (text.match(/[A-ZÀ-Þ]/g) || []).length / Math.max(1, letters);
    if (upperRatio > 0.6) score += 0.3;

    // Larger text height = more likely the vendor name.
    const h = line.bbox.y1 - line.bbox.y0;
    score += Math.min(0.4, h / 200);

    cands.push({ line, score });
  }

  if (cands.length === 0) {
    return { value: null, raw: null, confidence: 0, bbox: null };
  }

  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  // Tidy: title-case obvious shouty caps.
  const value = normalizeVendor(best.line.text.trim());

  return {
    value,
    raw: best.line.text,
    confidence: Math.min(0.9, 0.5 + best.score * 0.15),
    bbox: [best.line.bbox],
  };
}

function normalizeVendor(s: string): string {
  // If everything is upper-case and longer than 4 chars, title-case it.
  const letters = s.match(/[A-Za-zÀ-ÿ]/g) || [];
  if (letters.length > 4 && letters.every((c) => c === c.toUpperCase())) {
    return s
      .toLowerCase()
      .replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase());
  }
  return s;
}
