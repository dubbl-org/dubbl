import { convertAmount } from "@/lib/currency/converter";

const RATE_SCALE = 1_000_000;

export interface ConvertibleLine {
  debitAmount: number;
  creditAmount: number;
}

/**
 * Convert a balanced set of journal lines from document currency to the base
 * currency at `rate` (integer, 6 decimal places), **preserving balance**.
 *
 * Converting each line independently and rounding can leave total debits != total
 * credits by a minor unit or two. To keep the entry balanced, each side is
 * converted line-by-line and the rounding residual is absorbed into the largest
 * line on that side — so `sum(debit) === sum(credit)` always holds.
 *
 * When `rate === 1_000_000` (base == document currency) the amounts are
 * unchanged. Pure function: no DB, no side effects — safe to unit test.
 */
export function convertLinesToBase<T extends ConvertibleLine>(
  lines: T[],
  rate: number
): T[] {
  if (lines.length === 0) return lines;

  const docDebitTotal = lines.reduce((s, l) => s + l.debitAmount, 0);
  const docCreditTotal = lines.reduce((s, l) => s + l.creditAmount, 0);

  const targetDebitTotal = convertAmount(docDebitTotal, rate);
  const targetCreditTotal = convertAmount(docCreditTotal, rate);

  const converted = lines.map((l) => ({
    ...l,
    debitAmount: convertAmount(l.debitAmount, rate),
    creditAmount: convertAmount(l.creditAmount, rate),
  }));

  absorbResidual(converted, "debitAmount", targetDebitTotal);
  absorbResidual(converted, "creditAmount", targetCreditTotal);

  return converted;
}

function absorbResidual<T extends ConvertibleLine>(
  lines: T[],
  field: "debitAmount" | "creditAmount",
  target: number
) {
  const sum = lines.reduce((s, l) => s + l[field], 0);
  const residual = target - sum;
  if (residual === 0) return;

  // Add the residual to the largest line on this side (most material, least
  // distortion). Only lines that actually carry an amount on this side qualify.
  let idx = -1;
  let max = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][field] > max) {
      max = lines[i][field];
      idx = i;
    }
  }
  if (idx >= 0) {
    lines[idx][field] += residual;
  }
}

/** Resolve the document->base conversion rate, defaulting to 1:1. */
export function isUnitRate(rate: number): boolean {
  return rate === RATE_SCALE;
}
