// Date parsing for receipts. Many formats; we try them in order, score by:
//   - keyword proximity ("DATE", "ISSUED", etc.)
//   - format specificity (4-digit year > 2-digit)
//   - position (top of receipt is more likely the receipt date)
// We always return ISO yyyy-mm-dd.

import type { Field, Locale, OcrLine } from "../types";
import { buildKeywordRegex, getMergedKeywords } from "../util/keywords";

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, januar: 1, janv: 1, gen: 1, ene: 1, jaan: 1, jan_: 1,
  feb: 2, february: 2, februar: 2, fevr: 2, fev: 2, feb_: 2,
  mar: 3, march: 3, marz: 3, mar_: 3, mär: 3, märz: 3, mars: 3, marz_: 3,
  apr: 4, april: 4, avr: 4, abr: 4, apr_: 4,
  may: 5, mai: 5, maj: 5, mag: 5, mayo: 5,
  jun: 6, june: 6, juni: 6, juin: 6, junio: 6,
  jul: 7, july: 7, juli: 7, juil: 7, lug: 7, luglio: 7, julio: 7,
  aug: 8, august: 8, août: 8, aout: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, settembre: 9, septiembre: 9,
  oct: 10, october: 10, oktober: 10, ottobre: 10, octubre: 10, okt: 10,
  nov: 11, november: 11, novembre: 11, noviembre: 11,
  dec: 12, december: 12, dezember: 12, dec_: 12, dicembre: 12, diciembre: 12, dez: 12,
};

interface DateCandidate {
  iso: string;
  raw: string;
  baseConfidence: number;
  bbox: OcrLine["bbox"];
  hasKeyword: boolean;
  yPosition: number; // 0..1
}

export function parseDate(lines: OcrLine[], locale?: Locale): Field<string> {
  if (lines.length === 0) {
    return { value: null, raw: null, confidence: 0, bbox: null };
  }

  const keywords = getMergedKeywords(locale);
  const dateKeyRe = buildKeywordRegex(keywords.date);

  const docTopY = lines[0].bbox.y0;
  const docBotY = lines[lines.length - 1].bbox.y1;
  const totalH = Math.max(1, docBotY - docTopY);

  const candidates: DateCandidate[] = [];

  for (const line of lines) {
    const yMid = (line.bbox.y0 + line.bbox.y1) / 2;
    const yPosition = (yMid - docTopY) / totalH;
    const hasKeyword = dateKeyRe.test(line.text);

    const found = findDatesInText(line.text, locale);
    for (const d of found) {
      candidates.push({
        ...d,
        bbox: line.bbox,
        hasKeyword,
        yPosition,
      });
    }
  }

  if (candidates.length === 0) {
    return { value: null, raw: null, confidence: 0, bbox: null };
  }

  // Score: keyword presence + format + position.
  const scored = candidates.map((c) => {
    let score = c.baseConfidence;
    if (c.hasKeyword) score += 0.3;
    // Receipts are most-recent-on-top usually; receipt date typically in top half.
    if (c.yPosition < 0.5) score += 0.05;
    // Plausibility: 1990 ≤ year ≤ now+1
    const year = Number(c.iso.slice(0, 4));
    const nowY = new Date().getUTCFullYear();
    if (year < 1990 || year > nowY + 1) score -= 0.4;
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  return {
    value: best.iso,
    raw: best.raw,
    confidence: clamp01(best.score),
    bbox: [best.bbox],
  };
}

interface FoundDate {
  iso: string;
  raw: string;
  baseConfidence: number;
}

function findDatesInText(text: string, locale?: Locale): FoundDate[] {
  const out: FoundDate[] = [];

  // ISO 2026-05-10
  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) out.push({ iso, raw: m[0], baseConfidence: 0.9 });
  }

  // dd-mm-yyyy or mm-dd-yyyy with full year
  for (const m of text.matchAll(/\b(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{4})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);

    // Disambiguate: if a > 12, must be DMY. If b > 12, must be MDY.
    // Else use locale.
    let dmy = preferDMY(locale);
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) dmy = false;

    const iso = dmy ? toIso(y, b, a) : toIso(y, a, b);
    if (iso) {
      const conf = a > 12 || b > 12 ? 0.85 : 0.7;
      out.push({ iso, raw: m[0], baseConfidence: conf });
    }
  }

  // dd-mm-yy two-digit year
  for (const m of text.matchAll(/\b(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{2})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const yy = Number(m[3]);
    const y = yy >= 70 ? 1900 + yy : 2000 + yy;

    let dmy = preferDMY(locale);
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) dmy = false;

    const iso = dmy ? toIso(y, b, a) : toIso(y, a, b);
    if (iso) out.push({ iso, raw: m[0], baseConfidence: 0.55 });
  }

  // "15 Jan 2026" / "Jan 15, 2026" / "15 January 2026"
  const monthAlt = Object.keys(MONTH_NAMES).map((k) => k.replace(/_$/, "")).join("|");

  // day month year
  const reDMY = new RegExp(
    `\\b(\\d{1,2})\\s+(${monthAlt})\\.?\\s*,?\\s+(\\d{2,4})\\b`,
    "gi"
  );
  for (const m of reDMY.exec(text) ? [...text.matchAll(reDMY)] : []) {
    const d = Number(m[1]);
    const mo = MONTH_NAMES[m[2].toLowerCase()];
    let y = Number(m[3]);
    if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y;
    const iso = toIso(y, mo, d);
    if (iso) out.push({ iso, raw: m[0], baseConfidence: 0.8 });
  }

  // month day, year
  const reMDY = new RegExp(
    `\\b(${monthAlt})\\.?\\s+(\\d{1,2})\\s*,?\\s+(\\d{2,4})\\b`,
    "gi"
  );
  for (const m of reMDY.exec(text) ? [...text.matchAll(reMDY)] : []) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    const d = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y;
    const iso = toIso(y, mo, d);
    if (iso) out.push({ iso, raw: m[0], baseConfidence: 0.8 });
  }

  return out;
}

function toIso(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Validate via Date round-trip.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) return null;
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function preferDMY(locale?: Locale): boolean {
  if (!locale) return false;
  if (locale === "en-US" || locale === "en-CA") return false;
  return true;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
