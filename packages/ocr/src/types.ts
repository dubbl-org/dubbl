// Public types for @dubbl/ocr.

export type Locale =
  | "en-US"
  | "en-GB"
  | "en-AU"
  | "en-CA"
  | "de-DE"
  | "fr-FR"
  | "es-ES"
  | "it-IT"
  | "nl-NL"
  | "pt-PT"
  | "pt-BR"
  | "sv-SE"
  | "da-DK"
  | "nb-NO"
  | "fi-FI"
  | "pl-PL"
  | "hu-HU";

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  words: OcrWord[];
}

/** Generic typed extracted field with provenance for UI confirmation. */
export interface Field<T> {
  /** Parsed/normalized value, or null when nothing usable was found. */
  value: T | null;
  /** Raw source text the value came from (verbatim from the OCR). */
  raw: string | null;
  /** 0..1 confidence based on OCR confidence + parser strength. */
  confidence: number;
  /** Bounding boxes covering the source words (for UI overlay). */
  bbox: BoundingBox[] | null;
}

export interface LineItem {
  description: Field<string>;
  quantity: Field<number>;
  unitPrice: Field<number>;
  amount: Field<number>;
}

export interface ScanFields {
  vendor: Field<string>;
  date: Field<string>; // ISO yyyy-mm-dd
  total: Field<number>; // in minor units (cents)
  subtotal: Field<number>; // in minor units (cents)
  tax: Field<number>; // in minor units (cents)
  taxRate: Field<number>; // percent
  currency: Field<string>; // ISO code
  paymentMethod: Field<string>;
  receiptNumber: Field<string>;
  lineItems: LineItem[];
}

export interface ScanResult {
  /** All parsed fields. Each has confidence + bbox to help the user confirm. */
  fields: ScanFields;
  /** Raw OCR text, for fallback display. */
  text: string;
  /** Lines used during parsing (top-to-bottom). */
  lines: OcrLine[];
  /** Image dimensions (post-preprocess). */
  width: number;
  height: number;
  /** Locale used for parsing (driver hint, may be auto-detected). */
  locale: Locale;
  /** Overall confidence: avg of field confidences weighted by importance. */
  overallConfidence: number;
  /** Validation flags (e.g. subtotal+tax matches total). */
  warnings: string[];
  /** Total OCR/parse time in ms. */
  durationMs: number;
}

export type OcrInput =
  | File
  | Blob
  | ArrayBuffer
  | Uint8Array
  | string // dataURL or http(s) URL
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageData;

export interface ScanOptions {
  /** Hint for parsing (date format, decimal separator, keywords). Auto-detected if omitted. */
  locale?: Locale;
  /** Override Tesseract languages, e.g. ["eng", "deu"]. Default: derived from locale. */
  languages?: string[];
  /** Disable image preprocessing (raw image to Tesseract). Default: false. */
  rawInput?: boolean;
  /** Enable multi-pass OCR (different PSMs) and pick highest confidence. Default: true. */
  multiPass?: boolean;
  /** Where to load Tesseract.js worker assets from. Defaults to the npm package. */
  workerPath?: string;
  /** Where to load Tesseract.js core wasm. */
  corePath?: string;
  /** Where to load language traineddata. */
  langPath?: string;
  /** Logger callback for progress (0..1) and status. */
  onProgress?: (status: string, progress: number) => void;
  /** Cancellation signal. */
  signal?: AbortSignal;
}

export interface PreprocessResult {
  /** Final canvas/image data ready for Tesseract. */
  image: HTMLCanvasElement | ImageData | Blob;
  width: number;
  height: number;
  /** Estimated rotation applied (degrees). */
  rotationDeg: number;
  /** Whether we binarized the image. */
  binarized: boolean;
}
