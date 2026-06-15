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

export type SettlementRole = "bank" | "counter" | "fxGain" | "fxLoss";

export interface SettlementLeg {
  role: SettlementRole;
  debit: number;
  credit: number;
}

/**
 * Base-currency journal legs for settling a foreign-currency document, booking
 * the realised FX difference (reverse-and-rebook). All amounts are in base
 * currency minor units.
 *
 * - `amountBaseAtPayment`: settled amount converted at the payment-date rate
 *   (what actually hit/left the bank in base).
 * - `amountBaseAtIssue`: settled amount converted at the recognition rate
 *   (what AR/AP was carried at in base).
 *
 * The realised gain/loss is the difference. Legs always balance by
 * construction. `counter` is Accounts Receivable (invoice) or Accounts
 * Payable (bill).
 */
export function realizedSettlementLegs(
  type: "invoice" | "bill",
  amountBaseAtPayment: number,
  amountBaseAtIssue: number
): SettlementLeg[] {
  const fx = amountBaseAtPayment - amountBaseAtIssue;
  const legs: SettlementLeg[] = [];

  if (type === "invoice") {
    // Receivable: DR Bank (received), CR AR (carried), FX balances.
    legs.push({ role: "bank", debit: amountBaseAtPayment, credit: 0 });
    legs.push({ role: "counter", debit: 0, credit: amountBaseAtIssue });
    if (fx > 0) legs.push({ role: "fxGain", debit: 0, credit: fx });
    else if (fx < 0) legs.push({ role: "fxLoss", debit: -fx, credit: 0 });
  } else {
    // Payable: DR AP (carried), CR Bank (paid), FX balances.
    legs.push({ role: "counter", debit: amountBaseAtIssue, credit: 0 });
    legs.push({ role: "bank", debit: 0, credit: amountBaseAtPayment });
    if (fx > 0) legs.push({ role: "fxLoss", debit: fx, credit: 0 });
    else if (fx < 0) legs.push({ role: "fxGain", debit: 0, credit: -fx });
  }

  return legs;
}
