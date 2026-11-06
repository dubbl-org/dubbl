/**
 * Compound tax rates (e.g. GST + PST): a rate made of named parts, each with
 * its own percentage and, optionally, its own ledger account. Pure helpers so
 * posting and reports agree on how a line's tax divides between the parts.
 * Rates are basis points (1000 = 10%); amounts are integer cents.
 */
import { splitProportional } from "@/lib/reports/cash-basis";

export interface CompoundPart {
  rate: number;
  accountId: string | null;
}

/** A compound rate's total is the sum of its parts. */
export function compoundRate(parts: { rate: number }[]): number {
  return parts.reduce((s, p) => s + Math.max(0, p.rate), 0);
}

/**
 * Split one line's tax between the parts in proportion to their rates, to the
 * cent (largest remainder). Parts without an account use the default tax
 * account (accountId null). Returns one entry per part, in part order.
 */
export function splitCompoundTax(
  taxAmount: number,
  parts: CompoundPart[]
): { accountId: string | null; amount: number }[] {
  if (parts.length === 0) return [{ accountId: null, amount: taxAmount }];
  const sign = taxAmount < 0 ? -1 : 1;
  const amounts = splitProportional(
    parts.map((p) => Math.max(0, p.rate)),
    Math.abs(taxAmount)
  );
  // All-zero rates: everything stays on the default account.
  if (amounts.every((a) => a === 0) && taxAmount !== 0) return [{ accountId: null, amount: taxAmount }];
  return parts.map((p, i) => ({ accountId: p.accountId, amount: sign * amounts[i] }));
}
