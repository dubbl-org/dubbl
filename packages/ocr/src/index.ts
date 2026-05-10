// Public API for @dubbl/ocr.
//
// ```ts
// import { scan } from "@dubbl/ocr"
// const result = await scan(file, { locale: "en-US" })
// // result.fields.total.value === 1299  (cents)
// ```

import { recognize, terminate } from "./engine";
import { preprocessImage } from "./preprocess";
import {
  parseDate,
  parseTotal,
  parseTax,
  parseVendor,
  parseCurrency,
  parsePaymentMethod,
  parseReceiptNumber,
  parseLineItems,
} from "./parsers";
import type {
  Locale,
  OcrInput,
  ScanFields,
  ScanOptions,
  ScanResult,
} from "./types";
import { validateAndScore } from "./util/score";

/** Scan a receipt or invoice image. Runs preprocessing → OCR → field extraction. */
export async function scan(
  input: OcrInput,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const start = now();
  const locale: Locale = options.locale ?? "en-US";

  // 1) Preprocess (browser only — Tesseract handles raw bytes server-side).
  let imageInput: unknown = input;
  let imgW = 0;
  let imgH = 0;
  if (!options.rawInput && typeof window !== "undefined") {
    options.onProgress?.("preprocessing", 0);
    const pp = await preprocessImage(input);
    imageInput = pp.image;
    imgW = pp.width;
    imgH = pp.height;
  }

  // 2) Run Tesseract.
  options.onProgress?.("recognizing", 0);
  const { text, lines, meanConfidence } = await recognize(imageInput as OcrInput, {
    ...options,
    locale,
  });

  // 3) Parse fields.
  options.onProgress?.("parsing", 0.95);
  const totalParse = parseTotal(lines, locale);
  const taxParse = parseTax(lines, locale);

  // Find the y-position of the total line so we can stop line-item parsing there.
  const totalY = totalParse.total.bbox?.[0]?.y0;

  const fields: ScanFields = {
    vendor: parseVendor(lines),
    date: parseDate(lines, locale),
    total: totalParse.total,
    subtotal: totalParse.subtotal,
    tax: taxParse.tax,
    taxRate: taxParse.taxRate,
    currency: parseCurrency(lines, locale),
    paymentMethod: parsePaymentMethod(lines, locale),
    receiptNumber: parseReceiptNumber(lines, locale),
    lineItems: parseLineItems(lines, locale, totalY),
  };

  // Bake mean OCR confidence into each field's confidence (×0.5 floor).
  const ocrFloor = clamp01(meanConfidence / 100);
  for (const k of Object.keys(fields) as (keyof ScanFields)[]) {
    if (k === "lineItems") continue;
    const f = fields[k] as { confidence: number };
    if (f.confidence > 0) f.confidence = Math.max(f.confidence * (0.6 + 0.4 * ocrFloor), 0);
  }

  // 4) Validate + score.
  const { warnings, overallConfidence } = validateAndScore(fields);

  options.onProgress?.("done", 1);

  return {
    fields,
    text,
    lines,
    width: imgW,
    height: imgH,
    locale,
    overallConfidence,
    warnings,
    durationMs: Math.round(now() - start),
  };
}

/** Free up Tesseract workers. Safe to call any time; no-op if none cached. */
export async function shutdown(): Promise<void> {
  await terminate();
}

export type {
  Locale,
  OcrInput,
  ScanFields,
  ScanOptions,
  ScanResult,
  Field,
  LineItem,
  OcrLine,
  OcrWord,
  BoundingBox,
} from "./types";

export {
  parseDate,
  parseTotal,
  parseTax,
  parseVendor,
  parseCurrency,
  parsePaymentMethod,
  parseReceiptNumber,
  parseLineItems,
} from "./parsers";
export { preprocessImage } from "./preprocess";
export { parseAmount, toCents, findAmounts } from "./util/number";

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
