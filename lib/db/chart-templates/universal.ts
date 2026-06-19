import type { AccountTemplate } from "./types";

/**
 * Categories every business needs no matter which country template it uses —
 * chiefly the owner / director money movements that sit OFF the profit & loss
 * (money the owner puts in or takes out, a director's loan, dividends, and a
 * "sort it later" holding account).
 *
 * The localized country templates (FR/ES/BE/BR/IT/PT/DE/AT/SE) historically
 * defined none of these, which is why a director's-loan category never showed
 * up for those orgs. This overlay is layered on top of ANY template that
 * doesn't already provide the category (see `syncSystemAccounts`), so every org
 * — current and future, generic or localized — gets them automatically.
 *
 * The codes here are the generic-scheme defaults; the sync resolves them to a
 * free code per org when a localized template already uses one (e.g. Swedish
 * BAS uses 2510 for "Tax Liabilities"). Matching to avoid duplicates is done by
 * name, so these names must stay stable and distinctive.
 */
export const UNIVERSAL_ACCOUNTS: AccountTemplate[] = [
  { code: "2510", name: "Owner / Director Loan Account", type: "liability", subType: "current" },
  { code: "2520", name: "Suspense (to sort later)", type: "liability", subType: "current" },
  { code: "3200", name: "Owner's Drawings", type: "equity", subType: "equity" },
  { code: "3210", name: "Capital Contributions", type: "equity", subType: "equity" },
  { code: "3220", name: "Dividends Paid", type: "equity", subType: "equity" },
];

/**
 * Returns the next free numeric code at or after `preferred`, skipping anything
 * already in `used`. Keeps the original string width where possible (e.g.
 * "2510" -> "2511"). Falls back to appending digits for non-numeric codes.
 */
export function nextFreeCode(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) return preferred;
  const n = Number(preferred);
  if (Number.isFinite(n) && /^\d+$/.test(preferred)) {
    const width = preferred.length;
    for (let i = n + 1; i < n + 1000; i++) {
      const candidate = String(i).padStart(width, "0");
      if (!used.has(candidate)) return candidate;
    }
  }
  // Non-numeric or exhausted: suffix until free.
  let suffix = 1;
  while (used.has(`${preferred}-${suffix}`)) suffix++;
  return `${preferred}-${suffix}`;
}
