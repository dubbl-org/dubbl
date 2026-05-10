import type { OcrLine } from "../src/types";

let nextY = 0;

/** Build a minimal OcrLine for parser tests. y is auto-incremented unless given. */
export function L(text: string, y?: number, height = 20): OcrLine {
  const y0 = y ?? (nextY += 30);
  return {
    text,
    confidence: 90,
    bbox: { x0: 0, y0, x1: 600, y1: y0 + height },
    words: [],
  };
}

export function resetLineY(): void {
  nextY = 0;
}
