import type { OcrLine, OcrWord } from "../src/types";

let nextY = 0;

const CHAR_W = 10;

/** Build a minimal OcrLine for parser tests. Splits the text on whitespace
 *  and assigns sequential x-positioned bboxes to each word, mimicking what
 *  tesseract would emit. y is auto-incremented unless given. */
export function L(text: string, y?: number, height = 20): OcrLine {
  const y0 = y ?? (nextY += 30);
  const y1 = y0 + height;
  const words: OcrWord[] = [];
  let cursor = 10;
  // We deliberately use `text.split(/\s+/)` and track positions left-to-right
  // because the tabular line-item parser relies on word x-coordinates.
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const width = tok.length * CHAR_W;
    words.push({
      text: tok,
      confidence: 90,
      bbox: { x0: cursor, y0, x1: cursor + width, y1 },
    });
    cursor += width + CHAR_W;
  }
  return {
    text,
    confidence: 90,
    bbox: { x0: 0, y0, x1: Math.max(600, cursor), y1 },
    words,
  };
}

export function resetLineY(): void {
  nextY = 0;
}
