/** Pure helpers for applying a contact's bookkeeping defaults (no DB access). */

export interface ContactDefaults {
  revenueAccountId: string | null;
  expenseAccountId: string | null;
  taxRateId: string | null;
  isTaxExempt: boolean;
}

/**
 * Fill document lines from the contact's defaults:
 * - a line with no account gets the contact's income (sales) or spending
 *   (purchase) account;
 * - a line that doesn't mention a tax rate at all (undefined) gets the
 *   contact's default rate; an explicit null means "no tax" and is kept;
 * - on sales documents, a contact marked "Don't charge tax" gets no tax on
 *   any line.
 * Pure; returns new line objects.
 */
export function applyContactDefaults<L extends { accountId?: string | null; taxRateId?: string | null }>(
  lines: L[],
  defaults: ContactDefaults | null,
  kind: "sales" | "purchase"
): L[] {
  if (!defaults) return lines;
  const account = kind === "sales" ? defaults.revenueAccountId : defaults.expenseAccountId;
  const noTax = kind === "sales" && defaults.isTaxExempt;
  return lines.map((l) => ({
    ...l,
    accountId: l.accountId || account || l.accountId,
    taxRateId: noTax ? null : l.taxRateId === undefined ? defaults.taxRateId ?? undefined : l.taxRateId,
  }));
}
