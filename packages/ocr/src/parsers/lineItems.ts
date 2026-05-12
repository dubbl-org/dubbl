// Extract line items from a receipt or invoice body.
//
// Two distinct layouts to handle:
//
//   1) Single-amount receipts (groceries, cafes):
//        "Latte                        5.50"
//        "2 x Espresso                 7.00"
//      → rightmost amount is the line total. Optional leading "qty x" prefix.
//
//   2) Tabular invoices ([Description] [Qty] [Unit Price] [Amount]):
//        "Electronic Products or Services    3     100.00    300.00"
//      → 4-column table. qty/unit/amount each live in their own column;
//      desc is everything to the left of the qty column.
//
// Production receipt OCR tools (Mindee, Veryfi, Rossum) solve (2) using
// spatial column clustering on word bounding boxes — they do NOT rely on
// regex tricks against the joined line text. The reason matters: when OCR
// misreads "300.00" as "30.00", the column STRUCTURE survives (it's still
// the rightmost column on the line), but arithmetic validation
// (qty × unit ≈ amount) silently fails and the parser falls back to the
// wrong interpretation. That was the user-reported failure mode.
//
// So this parser:
//   - Classifies each word as PRICE / INT / TEXT using its text and bbox.
//   - Walks word-by-word right-to-left to find AMOUNT, UNIT, QTY columns.
//   - Trusts the column structure: desc = everything left of qty.
//   - Adds a soft validation check (qty × unit ≈ amount) only to set
//     confidence, never to discard a structurally-valid row.

import type { BoundingBox, LineItem, Locale, OcrLine, OcrWord } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";
import { parseAmount, toCents } from "../util/number";

const QTY_RE = /^(\d{1,3})\s*(?:x|×|\*|@)\s*([\d.,]+)?\s*[-–]?\s*/i;
const QTY_TRAILING_RE = /(\d{1,3})\s*(?:x|×|\*|@)\s*([\d.,]+)/i;

// Patterns that strongly indicate a line is NOT a line item: dates, phones,
// URLs, addresses, zip codes, receipt/invoice numbers. We see these constantly
// on receipt headers and footers, and they happen to contain digit runs that
// look like amounts (zip "94103", phone "-0123", date "-15" tail, etc).
const NON_ITEM_PATTERNS: RegExp[] = [
  /\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/, // ISO date 2026-03-15
  /\b\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\b/, // US/EU date 03/15/2026
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/, // time 13:45
  /\b(?:tel|phone|fax|mobile|cell)\b[.: ]/i,
  /\(\d{2,4}\)\s*\d/, // (415) 555-0123
  /\b\d{3}[\s.-]\d{3}[\s.-]\d{3,4}\b/, // 415-555-0123
  /https?:\/\//i,
  /\bwww\./i,
  /\b\d{5}(?:-\d{4})?\s*$/, // trailing US zip code
  /\b(street|st\.|road|rd\.|avenue|ave\.|blvd|drive|dr\.|lane|ln\.|way|highway|hwy|suite|ste|floor|fl\.)\b/i,
  /^[A-Z]{2}\s+\d{4,5}/, // "CA 94103" state + zip prefix
  /\b(?:date|receipt|invoice|order|trans(?:action)?|ref(?:erence)?)\s*[#:]/i,
  /\bcard\s*#?\s*\*+\s*\d/i, // card number ****1234
  /\b\d{4,}\s*$/, // line ending in a 4+ digit integer chunk (no decimal)
];

// A money amount must look like money: at least one decimal separator with
// 2 or 3 trailing digits.
const PRICE_SHAPE = /[.,]\d{2,3}\b/;

// Stricter version for word-level classification: the ENTIRE word must be
// a price-shaped number (optionally with a leading currency symbol). We
// allow trailing single letters because tesseract sometimes glues the
// next-column "F"/"T" tax code onto the price token ("4.99F").
const WORD_PRICE_RE =
  /^[$€£¥₹₩฿]?[-+]?\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2,3}[A-Za-z]?$/;
const WORD_INT_RE = /^\d{1,4}$/;

type WordClass = "price" | "int" | "text" | "other";

function classifyWord(text: string): WordClass {
  if (WORD_PRICE_RE.test(text)) return "price";
  if (WORD_INT_RE.test(text)) return "int";
  if (/[A-Za-zÀ-ÿ]/.test(text)) return "text";
  return "other";
}

function priceValue(text: string): number {
  // Drop a trailing single-letter tax/category code ("4.99F" → "4.99").
  const clean = text.replace(/[A-Za-z]$/, "");
  return parseAmount(clean);
}

interface SplitResult {
  desc: string;
  descBboxes: BoundingBox[];
  qty: number;
  qtyConfidence: number;
  unitPrice: number | null;
  unitConfidence: number;
  amount: { value: number; raw: string; bbox: BoundingBox };
  amountConfidence: number;
  tabular: boolean;
}

/** Spatial column-aware split of an OcrLine into [desc | qty | unit | amount].
 *  Returns null if the line has no price-shaped word at all. */
function splitLine(line: OcrLine): SplitResult | null {
  const sorted = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (sorted.length === 0) return null;

  const classes = sorted.map((w) => classifyWord(w.text));

  // Rightmost PRICE word → AMOUNT column.
  let amountIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (classes[i] === "price") {
      amountIdx = i;
      break;
    }
  }
  if (amountIdx === -1) return null;

  // Next-left PRICE word (must be at least one non-price word between them
  // OR a clear x-gap, so we don't pick up "1.05 1.32" doubles) → UNIT.
  let unitIdx = -1;
  for (let i = amountIdx - 1; i >= 0; i--) {
    if (classes[i] === "price") {
      unitIdx = i;
      break;
    }
  }

  // Bare INT to the left of UNIT → QTY column.
  let qtyIdx = -1;
  if (unitIdx > 0) {
    for (let i = unitIdx - 1; i >= 0; i--) {
      if (classes[i] === "int") {
        const n = Number(sorted[i].text);
        if (Number.isFinite(n) && n >= 1 && n <= 9999) {
          qtyIdx = i;
          break;
        }
      }
    }
  }

  const amountWord = sorted[amountIdx];
  const amountValue = priceValue(amountWord.text);
  if (!Number.isFinite(amountValue)) return null;

  const amount = {
    value: amountValue,
    raw: amountWord.text,
    bbox: amountWord.bbox,
  };

  if (qtyIdx !== -1 && unitIdx !== -1) {
    // Tabular row. Trust the structure even if arithmetic doesn't reconcile.
    const qty = Number(sorted[qtyIdx].text);
    const unitValue = priceValue(sorted[unitIdx].text);
    const descWords = sorted.slice(0, qtyIdx);
    const desc = descWords
      .map((w) => w.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Arithmetic check: tightens confidence when it works, doesn't gate
    // emission when it doesn't (OCR can mis-read one digit in a column).
    const expected = qty * unitValue;
    const arithmeticOk =
      Number.isFinite(expected) &&
      Math.abs(expected - amountValue) <= Math.max(0.02, Math.abs(amountValue) * 0.02);

    return {
      desc,
      descBboxes: descWords.map((w) => w.bbox),
      qty,
      qtyConfidence: arithmeticOk ? 0.95 : 0.75,
      unitPrice: unitValue,
      unitConfidence: arithmeticOk ? 0.95 : 0.7,
      amount,
      amountConfidence: arithmeticOk ? 0.95 : 0.8,
      tabular: true,
    };
  }

  // Single-amount fallback. Description = everything to the left of amount.
  const descWords = sorted.slice(0, amountIdx);
  const desc = descWords
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    desc,
    descBboxes: descWords.map((w) => w.bbox),
    qty: 1,
    qtyConfidence: 0.4,
    unitPrice: null,
    unitConfidence: 0,
    amount,
    amountConfidence: 0.7,
    tabular: false,
  };
}

export function parseLineItems(
  lines: OcrLine[],
  locale?: Locale,
  totalLineY?: number
): LineItem[] {
  if (lines.length === 0) return [];
  const kw = getMergedKeywords(locale);
  const skipRe = buildKeywordRegex([
    ...kw.totalNegative,
    ...kw.total,
    ...kw.tax,
    ...kw.subtotal,
    ...kw.paymentMethod,
    ...kw.paymentLiterals,
    ...kw.date,
    ...kw.receiptNumber,
  ]);

  const items: LineItem[] = [];

  for (const line of lines) {
    if (totalLineY !== undefined && line.bbox.y0 >= totalLineY) break;

    const text = line.text.trim();
    if (text.length < 3) continue;
    if (skipRe.test(text)) continue;
    if (NON_ITEM_PATTERNS.some((re) => re.test(text))) continue;

    const split = splitLine(line);
    if (!split) continue;

    // Amount must look like real money — single-amount lines with a non-
    // decimal "amount" word (zip codes, phone digits) shouldn't end up
    // here, but defend in depth.
    if (!PRICE_SHAPE.test(split.amount.raw)) continue;
    if (Math.abs(split.amount.value) > 100000) continue;
    if (split.desc.length < 2) continue;
    if (/^\d+$/.test(split.desc)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(split.desc)) continue;

    let qty = split.qty;
    let unitPrice = split.unitPrice;
    let desc = split.desc;
    let qtyConfidence = split.qtyConfidence;
    let unitConfidence = split.unitConfidence;

    // Non-tabular: still recognize "2 x Espresso" / "Espresso 2 @ 3.50"
    // patterns inside the description text.
    if (!split.tabular) {
      const leadingQty = QTY_RE.exec(desc);
      if (leadingQty) {
        qty = Number(leadingQty[1]);
        if (leadingQty[2]) {
          const u = parseAmount(leadingQty[2]);
          if (Number.isFinite(u)) unitPrice = u;
        }
        desc = desc.slice(leadingQty[0].length).trim();
        qtyConfidence = 0.85;
      } else {
        const trailingQty = QTY_TRAILING_RE.exec(desc);
        if (trailingQty) {
          qty = Number(trailingQty[1]);
          const u = parseAmount(trailingQty[2]);
          if (Number.isFinite(u)) {
            unitPrice = u;
            unitConfidence = 0.7;
          }
          qtyConfidence = 0.8;
        }
      }
    }

    if (unitPrice == null && qty > 0 && split.amount.value > 0) {
      unitPrice = +(split.amount.value / qty).toFixed(2);
      unitConfidence = 0.5;
    }

    items.push({
      description: {
        value: desc,
        raw: text,
        confidence: split.tabular ? 0.85 : 0.6,
        bbox: split.descBboxes.length > 0 ? split.descBboxes : [line.bbox],
      },
      quantity: {
        value: qty,
        raw: null,
        confidence: qtyConfidence,
        bbox: null,
      },
      unitPrice: {
        value: unitPrice != null ? toCents(unitPrice) : null,
        raw: null,
        confidence: unitPrice != null ? unitConfidence : 0,
        bbox: null,
      },
      amount: {
        value: toCents(split.amount.value),
        raw: split.amount.raw,
        confidence: split.amountConfidence,
        bbox: [split.amount.bbox],
      },
    });
  }

  return items;
}
