# @dubbl/ocr

Deterministic receipt and invoice OCR for bookkeeping apps. No AI, no cloud
service — just Tesseract.js, careful image preprocessing, and rule-based field
extraction tuned for receipts.

## Why no AI?

Cloud OCR services (Veryfi, Klippa, Google Document AI) are accurate but
expensive, send customer financial data off-device, and introduce a remote
dependency. For most expense workflows the receipts have a small predictable
vocabulary and a tabular layout. Rule-based parsers, when paired with good
preprocessing and per-field confidence scoring, hit ~85-95% accuracy on common
fields without ever leaving the browser.

If a field is below the confidence threshold the UI shows it for the user to
correct: that human-in-the-loop step is what services like Xero and QuickBooks
also rely on.

## Install

```bash
pnpm add @dubbl/ocr tesseract.js
```

## Quick start

```ts
import { scan } from "@dubbl/ocr"

// Anything Tesseract can read: File, Blob, Canvas, ImageData, dataURL, URL.
const result = await scan(file, { locale: "en-US" })

result.fields.total.value      // 1299  (always integer cents)
result.fields.total.confidence // 0.92
result.fields.total.bbox       // [{x0,y0,x1,y1}] for UI overlay
result.fields.vendor.value     // "Starbucks"
result.fields.date.value       // "2026-05-10"
result.fields.tax.value        // 250
result.fields.lineItems        // [{ description, qty, unitPrice, amount }, ...]
result.warnings                // ["subtotal + tax ≠ total"], etc.
```

Every value field follows `{ value, raw, confidence, bbox }`. Show the
`bbox` over the source image to give the user visual confirmation.

## Pipeline

1. **Preprocess** — grayscale, contrast stretch, Otsu binarization, deskew,
   upscale to ≥1200 px on the short side (≈300 DPI).
2. **OCR** — Tesseract.js with three PSM passes (single-block, single-column,
   sparse). Highest mean-confidence run wins.
3. **Field parsers** — keyword + regex per locale, bounding-box aware.
4. **Cross-validate** — `subtotal + tax ≈ total` boosts confidence; mismatch
   adds a warning.

## Locales

`en-US`, `en-GB`, `en-AU`, `en-CA`, `de-DE`, `fr-FR`, `es-ES`, `it-IT`,
`nl-NL`, `pt-PT`, `pt-BR`, `sv-SE`, `da-DK`, `nb-NO`, `fi-FI`, `pl-PL`,
`hu-HU`. Each locale ships keyword variants and a default currency. Add
`languages: ["eng", "deu"]` to override the Tesseract language packs.

## License

MIT
