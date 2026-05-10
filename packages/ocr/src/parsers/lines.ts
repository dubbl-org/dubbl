// Convert Tesseract word-level output into ordered receipt lines.
// Receipts are vertical lists; we cluster words by y-coordinate and sort by x.

import type { OcrLine, OcrWord, BoundingBox } from "../types";

/** Cluster Tesseract words into lines using their y-midpoints. */
export function clusterWordsToLines(
  words: OcrWord[],
  options: { tolerance?: number } = {}
): OcrLine[] {
  if (words.length === 0) return [];

  // Estimate a typical glyph height to choose a clustering tolerance.
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 12;
  const tol = options.tolerance ?? Math.max(4, medianH * 0.55);

  const sorted = [...words].sort((a, b) => midY(a.bbox) - midY(b.bbox));

  const buckets: OcrWord[][] = [];
  let currentY = -Infinity;

  for (const w of sorted) {
    const y = midY(w.bbox);
    if (Math.abs(y - currentY) > tol || buckets.length === 0) {
      buckets.push([w]);
      currentY = y;
    } else {
      buckets[buckets.length - 1].push(w);
      // Update running mean for the bucket so wide lines don't drift.
      const last = buckets[buckets.length - 1];
      currentY = last.reduce((s, x) => s + midY(x.bbox), 0) / last.length;
    }
  }

  return buckets.map((bucketWords) => {
    bucketWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const text = bucketWords.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
    const bbox = unionBox(bucketWords.map((w) => w.bbox));
    const confidence = bucketWords.reduce((s, w) => s + w.confidence, 0) / bucketWords.length;
    return { text, bbox, confidence, words: bucketWords };
  });
}

function midY(b: BoundingBox): number {
  return (b.y0 + b.y1) / 2;
}

function unionBox(boxes: BoundingBox[]): BoundingBox {
  return boxes.reduce(
    (acc, b) => ({
      x0: Math.min(acc.x0, b.x0),
      y0: Math.min(acc.y0, b.y0),
      x1: Math.max(acc.x1, b.x1),
      y1: Math.max(acc.y1, b.y1),
    }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  );
}

/** Find words inside a line that match the given regex. */
export function wordsMatching(line: OcrLine, re: RegExp): OcrWord[] {
  return line.words.filter((w) => re.test(w.text));
}

/** Find the rightmost word on a line by x1, optional regex filter. */
export function rightmostWord(line: OcrLine, re?: RegExp): OcrWord | null {
  const candidates = re ? wordsMatching(line, re) : line.words;
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.bbox.x1 - a.bbox.x1)[0];
}
