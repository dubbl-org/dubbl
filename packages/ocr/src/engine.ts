// Tesseract.js wrapper with:
//   - Worker pool (one persistent worker per language set)
//   - Multi-pass recognition with different PSMs, picks the highest-confidence run
//   - Word-level bounding box extraction normalized to our types
//
// Tesseract.js v5+ exposes `createWorker(langs, oem, options)`. PSM modes are
// enumerated in the package; we re-declare the values we need to avoid the
// runtime import cost on the server.

import type { Locale, OcrInput, OcrLine, OcrWord, ScanOptions } from "./types";
import { clusterWordsToLines } from "./parsers/lines";

// Tesseract enums (re-declared so we don't need to import them eagerly).
const PSM = {
  AUTO: 3,
  SINGLE_COLUMN: 4,
  SINGLE_BLOCK: 6,
  SINGLE_LINE: 7,
  SPARSE: 11,
  SPARSE_OSD: 12,
} as const;

interface RecognizeRunResult {
  text: string;
  words: OcrWord[];
  meanConfidence: number;
  psm: number;
}

interface WorkerLike {
  setParameters: (params: Record<string, string | number>) => Promise<void>;
  recognize: (
    input: unknown,
    options?: unknown,
    output?: { text?: boolean; blocks?: boolean }
  ) => Promise<{ data: TesseractData }>;
  terminate: () => Promise<void>;
}

interface TesseractData {
  text: string;
  confidence: number;
  blocks?: TesseractBlock[] | null;
  // Tesseract.js v5 keeps these on `data.blocks[].paragraphs[].lines[].words[]`.
}

interface TesseractBlock {
  paragraphs?: TesseractParagraph[] | null;
}

interface TesseractParagraph {
  lines?: TesseractLine[] | null;
}

interface TesseractLine {
  words?: TesseractWord[] | null;
}

interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

const workerCache = new Map<string, Promise<WorkerLike>>();

function localeToLangs(locale?: Locale): string[] {
  if (!locale) return ["eng"];
  if (locale.startsWith("en")) return ["eng"];
  if (locale.startsWith("de")) return ["deu", "eng"];
  if (locale.startsWith("fr")) return ["fra", "eng"];
  if (locale.startsWith("es")) return ["spa", "eng"];
  if (locale.startsWith("it")) return ["ita", "eng"];
  if (locale.startsWith("nl")) return ["nld", "eng"];
  if (locale.startsWith("pt")) return ["por", "eng"];
  if (locale.startsWith("sv")) return ["swe", "eng"];
  if (locale.startsWith("da")) return ["dan", "eng"];
  if (locale.startsWith("nb")) return ["nor", "eng"];
  if (locale.startsWith("fi")) return ["fin", "eng"];
  if (locale.startsWith("pl")) return ["pol", "eng"];
  if (locale.startsWith("hu")) return ["hun", "eng"];
  return ["eng"];
}

async function getWorker(
  langs: string[],
  options: ScanOptions
): Promise<WorkerLike> {
  const key = langs.join("+");
  let p = workerCache.get(key);
  if (!p) {
    p = (async () => {
      // Dynamic import so server bundles that never call scan() don't pull
      // tesseract.js into their tree.
      const mod: typeof import("tesseract.js") = await import("tesseract.js");

      // tesseract.js v7 spreads our options over its defaults, so an explicit
      // `logger: undefined` overwrites the default no-op logger and the worker
      // crashes with "TypeError: logger is not a function". Only include keys
      // we actually want to set.
      const workerOpts: Record<string, unknown> = {};
      if (options.workerPath) workerOpts.workerPath = options.workerPath;
      if (options.corePath) workerOpts.corePath = options.corePath;
      if (options.langPath) workerOpts.langPath = options.langPath;
      if (options.onProgress) {
        workerOpts.logger = (m: { status?: string; progress?: number }) => {
          options.onProgress?.(m.status ?? "", m.progress ?? 0);
        };
      }

      // Receipt-friendly init config. The dawg/dictionary parameters are
      // INIT-ONLY in tesseract — setParameters silently rejects them. Pass
      // them as the 4th arg of createWorker. We intentionally drop the
      // dictionary bias because receipts are full of brand names, codes and
      // prices the dictionary would happily miscorrect ("USD" → "usb",
      // "VENMO" → "vendor", "TOTAL 12.99" → "TOTAL 12.991", etc.).
      const initConfig = {
        load_system_dawg: "0",
        load_freq_dawg: "0",
        load_unambig_dawg: "0",
        load_punc_dawg: "0",
        load_number_dawg: "0",
        load_bigram_dawg: "0",
      };

      const w = await mod.createWorker(langs, 1, workerOpts, initConfig);

      // Runtime parameters: column alignment for bbox clustering, and an
      // assumed DPI so tesseract doesn't print "Invalid resolution 0 dpi"
      // warnings (the value just has to be plausible — we control sizing).
      await w.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      return w as unknown as WorkerLike;
    })();
    workerCache.set(key, p);
  }
  return p;
}

/** Recognize an image. Runs multiple PSMs and picks the highest-mean-confidence. */
export async function recognize(
  input: OcrInput,
  options: ScanOptions = {}
): Promise<{ text: string; lines: OcrLine[]; words: OcrWord[]; meanConfidence: number }> {
  const langs = options.languages ?? localeToLangs(options.locale);
  const worker = await getWorker(langs, options);

  // PSM 4 (SINGLE_COLUMN) is the receipt sweet spot — tesseract treats the
  // page as one column of text of variable line widths, which matches the
  // [description] ... [amount] structure better than PSM 6 (uniform block).
  // PSM 6 is a good fallback for densely-packed receipts; PSM 11 (sparse)
  // helps when columns are widely separated but mis-reads dictionary words.
  const psms =
    options.multiPass === false
      ? [PSM.SINGLE_COLUMN]
      : [PSM.SINGLE_COLUMN, PSM.SINGLE_BLOCK, PSM.SPARSE];

  const runs: RecognizeRunResult[] = [];
  for (const psm of psms) {
    if (options.signal?.aborted) throw new Error("OCR aborted");
    await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
    // tesseract.js v6+ requires explicit output selection — without
    // `blocks: true` the response has data.text only and data.blocks is null,
    // which would collapse our word/bbox pipeline to zero output.
    const { data } = await worker.recognize(
      input as unknown,
      {},
      { text: true, blocks: true }
    );
    const words = flattenWords(data);
    runs.push({
      text: data.text ?? "",
      words,
      meanConfidence: data.confidence ?? meanWordConfidence(words),
      psm,
    });
  }

  // Pick highest mean confidence; tiebreak by word count (fuller pages tend to be better).
  runs.sort((a, b) => {
    const dc = b.meanConfidence - a.meanConfidence;
    if (Math.abs(dc) > 0.5) return dc;
    return b.words.length - a.words.length;
  });

  const best = runs[0];
  const lines = clusterWordsToLines(best.words);

  return {
    text: best.text,
    lines,
    words: best.words,
    meanConfidence: best.meanConfidence,
  };
}

/** Terminate cached workers (call on app shutdown / tab unload). */
export async function terminate(): Promise<void> {
  for (const p of workerCache.values()) {
    try {
      const w = await p;
      await w.terminate();
    } catch {
      // ignore
    }
  }
  workerCache.clear();
}

function flattenWords(data: TesseractData): OcrWord[] {
  const out: OcrWord[] = [];
  const blocks = data.blocks ?? [];
  for (const block of blocks) {
    const paragraphs = block.paragraphs ?? [];
    for (const para of paragraphs) {
      const lines = para.lines ?? [];
      for (const line of lines) {
        const words = line.words ?? [];
        for (const w of words) {
          if (!w?.text) continue;
          out.push({
            text: w.text,
            confidence: w.confidence ?? 0,
            bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
          });
        }
      }
    }
  }
  return out;
}

function meanWordConfidence(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  return words.reduce((s, w) => s + w.confidence, 0) / words.length;
}
