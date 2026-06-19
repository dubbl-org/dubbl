/**
 * Maps the plain-language "what was this?" categorize choices to the chart
 * account they should post to. Pure data + a resolver with no server imports,
 * so both the categorize UI (client) and the MCP tools (server) resolve a
 * behavior to the SAME account.
 *
 * Resolution is by stable account name first (the universal owner/director
 * categories carry the same English name in every country template — see
 * lib/db/chart-templates/universal.ts), then by code, then by sub-type. This
 * keeps it correct even when a localized template gives the account a different
 * code (e.g. Swedish BAS bumps the director loan off its 2510 "Tax Liabilities").
 *
 * None of this enforces country-specific tax law — it only records the money on
 * the right account. Interest on a loan is always a separate, optional line, so
 * a 0% owner/director loan needs no interest entry at all.
 */
export type SpecialCategoryRole =
  | "owner_director_loan"
  | "owner_drawings"
  | "capital_introduced"
  | "dividends_paid"
  | "suspense"
  | "reimbursements_payable"
  | "tax_payable";

export const SPECIAL_CATEGORY_ROLES: SpecialCategoryRole[] = [
  "owner_director_loan",
  "owner_drawings",
  "capital_introduced",
  "dividends_paid",
  "suspense",
  "reimbursements_payable",
  "tax_payable",
];

interface RoleResolution {
  /** Human label for the role (plain language). */
  label: string;
  /** Exact account names to match, in priority order. */
  names: string[];
  /** Account codes to match if no name matched, in priority order. */
  codes: string[];
  /** Account sub-types to match as a last resort. */
  subTypes?: string[];
}

export const SPECIAL_CATEGORY_RESOLUTION: Record<SpecialCategoryRole, RoleResolution> = {
  owner_director_loan: {
    label: "Owner / director loan",
    names: ["Owner / Director Loan Account"],
    codes: ["2510"],
  },
  owner_drawings: {
    label: "Money the owner took out (drawings)",
    names: ["Owner's Drawings"],
    codes: ["3200"],
  },
  capital_introduced: {
    label: "Money the owner put in",
    names: ["Capital Contributions"],
    codes: ["3210"],
  },
  dividends_paid: {
    label: "Dividend paid",
    names: ["Dividends Paid"],
    codes: ["3220"],
  },
  suspense: {
    label: "Sort it out later",
    names: ["Suspense (to sort later)"],
    codes: ["2520"],
  },
  reimbursements_payable: {
    label: "Repay someone for a business cost",
    names: ["Employee Reimbursements Payable"],
    codes: ["2110"],
  },
  tax_payable: {
    label: "Pay the tax office",
    names: ["VAT / GST Suspense", "Output VAT / GST Payable", "Sales Tax Payable"],
    codes: ["2240", "2200", "2230"],
    subTypes: ["output_vat"],
  },
};

export interface ResolvableAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  subType?: string | null;
}

/**
 * Resolves a special-category role to the org's matching account from a list of
 * accounts (live, non-deleted). Returns null if the org has no matching
 * account — callers should hide the choice or fall back to a manual pick.
 */
export function resolveSpecialAccount<T extends ResolvableAccount>(
  role: SpecialCategoryRole,
  accounts: T[],
): T | null {
  const r = SPECIAL_CATEGORY_RESOLUTION[role];
  for (const name of r.names) {
    const hit = accounts.find((a) => a.name === name);
    if (hit) return hit;
  }
  for (const code of r.codes) {
    const hit = accounts.find((a) => a.code === code);
    if (hit) return hit;
  }
  for (const sub of r.subTypes ?? []) {
    const hit = accounts.find((a) => a.subType === sub);
    if (hit) return hit;
  }
  return null;
}
