// Locale-aware money/number normalization.
//
// Receipts use either:
//   - "1,234.56" (US/UK/CA — comma thousands, dot decimal)
//   - "1.234,56" (DE/FR/IT/ES/etc. — dot thousands, comma decimal)
//   - "1 234,56" (FR/SE — space thousands)
//   - "1234.56" or "1234,56" (no thousand separator)
//
// We pick the format heuristically by looking at which separator appears LAST
// (that one is the decimal). For trailing 3+ digits with no other separator we
// assume thousand-separator (e.g. "1.234" -> 1234, never 1.234).

const MAX_DECIMAL_DIGITS = 3;

/** Normalize a money-like string to a Number. Returns NaN if unparseable. */
export function parseAmount(input: string): number {
  if (!input) return NaN;
  // Strip currency symbols, letters, leading/trailing whitespace.
  let s = input
    .replace(/[A-Za-z€£$¥₹₩฿zł kr]/gu, " ")
    .replace(/[^\d.,\-+\s]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!s) return NaN;

  // Pull off sign.
  let sign = 1;
  if (s.startsWith("-")) { sign = -1; s = s.slice(1); }
  else if (s.startsWith("+")) { s = s.slice(1); }

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot === -1 && lastComma === -1) {
    const n = Number(s);
    return isFinite(n) ? sign * n : NaN;
  }

  // Both present: the LAST one is the decimal separator.
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastDot > lastComma) {
      // dot decimal, comma thousands
      s = s.replace(/,/g, "");
    } else {
      // comma decimal, dot thousands
      s = s.replace(/\./g, "").replace(/,/g, ".");
    }
    const n = Number(s);
    return isFinite(n) ? sign * n : NaN;
  }

  // Only one separator. Need to decide thousands vs decimal.
  const sep = lastDot !== -1 ? "." : ",";
  const parts = s.split(sep);

  if (parts.length === 2) {
    const tail = parts[1];
    if (tail.length === 3 && parts[0].length >= 1 && /^\d+$/.test(parts[0]) && /^\d+$/.test(tail)) {
      // Could be either "1.234" (=1234, EU thousands) or "1.234" (=1.234 USD).
      // For receipt totals we rarely see "1.234" meaning "one point two three four".
      // Treat 3-digit tail as thousands-grouped integer.
      return sign * Number(parts.join(""));
    }
    if (tail.length <= MAX_DECIMAL_DIGITS) {
      // Treat as decimal.
      const n = Number(`${parts[0]}.${tail}`);
      return isFinite(n) ? sign * n : NaN;
    }
    // Long tail — treat as no-decimal (digits only) interpretation.
    return sign * Number(parts.join(""));
  }

  // Multiple of the same separator — must be thousands grouping.
  const merged = parts.join("");
  const n = Number(merged);
  return isFinite(n) ? sign * n : NaN;
}

/** Convert a parsed amount to integer minor units (cents). */
export function toCents(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Match all amount-like substrings inside a line. Returns matches with index. */
export interface AmountMatch {
  raw: string;
  value: number;
  index: number;
  length: number;
}

// Each alternative pairs a thousands separator with a compatible decimal
// separator. Listing them explicitly (vs. the looser `[.,\s]` group used
// before) keeps a layout like "3 100.00" from being read as the single
// number 3,100.00 — the space here is column padding, not French
// thousands-grouping. Order matters: most-specific alternatives first so
// the regex engine doesn't truncate a thousands-grouped number into a
// shorter match.
const AMOUNT_RE = new RegExp(
  [
    // 1,234.56 — comma thousands, dot decimal (US/UK/CA/AU)
    String.raw`[-+]?\d{1,3}(?:,\d{3})+\.\d{1,3}`,
    // 1.234,56 — dot thousands, comma decimal (DE/IT/ES/NL/PT/HU/PL/...)
    String.raw`[-+]?\d{1,3}(?:\.\d{3})+,\d{1,3}`,
    // 1 234,56 / 1 234,56 — space (or NBSP) thousands, comma decimal (FR/SE/FI/NO/CZ)
    String.raw`[-+]?\d{1,3}(?:[\s ]\d{3})+,\d{1,3}`,
    // 12.99 / 12,99 — plain decimal, no thousands grouping
    String.raw`[-+]?\d+[.,]\d{1,3}`,
    // 1234 — bare integer (qty, year fragment, sometimes a whole-number price)
    String.raw`[-+]?\d+`,
  ].join("|"),
  "g"
);

export function findAmounts(text: string): AmountMatch[] {
  const out: AmountMatch[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const raw = m[0];
    const v = parseAmount(raw);
    if (!isFinite(v)) continue;
    // Reject obvious non-money like single digits without context — keep them, parsers can reject.
    out.push({ raw, value: v, index: m.index ?? 0, length: raw.length });
  }
  return out;
}

/** Largest amount on a given line, useful when keyword line doesn't have a colon. */
export function largestAmount(text: string): AmountMatch | null {
  const all = findAmounts(text);
  if (all.length === 0) return null;
  return all.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
}

/** Right-most amount on a line — receipts almost always right-align prices. */
export function rightmostAmount(text: string): AmountMatch | null {
  const all = findAmounts(text);
  if (all.length === 0) return null;
  return all[all.length - 1];
}
