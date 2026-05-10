// Detect currency from receipt text. Receipts usually contain either an ISO code
// (USD, EUR, GBP) or a symbol ($, €, £). We score symbol matches lower than
// explicit ISO mentions and let the locale provide a fallback.

import type { Field, Locale, OcrLine } from "../types";

const SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "฿": "THB",
  "zł": "PLN",
  "kr": "SEK",
  "Kč": "CZK",
  "Ft": "HUF",
};

const ISO_RE = /\b(USD|EUR|GBP|CAD|AUD|NZD|CHF|SEK|NOK|DKK|JPY|INR|HUF|PLN|CZK|RON|BGN|HRK|MXN|BRL|ZAR|SGD|HKD|TWD|KRW|THB|IDR|PHP|VND|TRY|ILS|AED|SAR|QAR)\b/;

const LOCALE_DEFAULT: Record<Locale, string> = {
  "en-US": "USD",
  "en-GB": "GBP",
  "en-AU": "AUD",
  "en-CA": "CAD",
  "de-DE": "EUR",
  "fr-FR": "EUR",
  "es-ES": "EUR",
  "it-IT": "EUR",
  "nl-NL": "EUR",
  "pt-PT": "EUR",
  "pt-BR": "BRL",
  "sv-SE": "SEK",
  "da-DK": "DKK",
  "nb-NO": "NOK",
  "fi-FI": "EUR",
  "pl-PL": "PLN",
  "hu-HU": "HUF",
};

export function parseCurrency(lines: OcrLine[], locale?: Locale): Field<string> {
  // 1) ISO code anywhere in the text — highest signal.
  for (const line of lines) {
    const iso = ISO_RE.exec(line.text);
    if (iso) {
      return {
        value: iso[1],
        raw: iso[0],
        confidence: 0.95,
        bbox: [line.bbox],
      };
    }
  }

  // 2) Symbol match — cheaper but ambiguous ($ might be CAD/AUD/USD).
  // Prefer the symbol that appears most often near amounts.
  const counts: Record<string, { n: number; bbox: typeof lines[number]["bbox"] }> = {};
  for (const line of lines) {
    for (const sym of Object.keys(SYMBOL_TO_CODE)) {
      if (line.text.includes(sym)) {
        const code = SYMBOL_TO_CODE[sym];
        counts[code] = { n: (counts[code]?.n ?? 0) + 1, bbox: line.bbox };
      }
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1].n - a[1].n)[0];
  if (best) {
    let code = best[0];
    // For ambiguous "$", prefer locale default if it's also dollar-using.
    if (code === "USD" && locale) {
      const fallback = LOCALE_DEFAULT[locale];
      if (["USD", "CAD", "AUD", "NZD", "SGD", "HKD"].includes(fallback)) {
        code = fallback;
      }
    }
    return {
      value: code,
      raw: best[0],
      confidence: 0.7,
      bbox: [best[1].bbox],
    };
  }

  // 3) Locale fallback — low confidence.
  if (locale && LOCALE_DEFAULT[locale]) {
    return { value: LOCALE_DEFAULT[locale], raw: null, confidence: 0.3, bbox: null };
  }

  return { value: null, raw: null, confidence: 0, bbox: null };
}
