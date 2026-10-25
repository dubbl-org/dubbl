/**
 * Compatibility shim. The tax-return computation now lives in lib/tax/ledger.ts
 * (primitives) and lib/tax/engine.ts (boxes), driven by per-country modules in
 * lib/tax/modules. This file keeps the old import paths working until Phase 6
 * deletes it.
 */
export {
  getOrgTaxConfig,
  resolveBasis,
  getControlAccountId,
  controlAccountMovement,
  computeEcSales,
  accountTransactions,
  type BoxTransaction,
  type OrgTaxConfig,
  type TaxBasis,
} from "@/lib/tax/ledger";

import { accountTransactions } from "@/lib/tax/ledger";
import type { BoxTransaction, TaxBasis } from "@/lib/tax/ledger";

/** Box → control-account code + natural sign, for the GB/AU drill-down route. */
const BOX_ACCOUNT: Record<string, { code: string; sign: "credit" | "debit" }> = {
  "1": { code: "2200", sign: "credit" },
  "4": { code: "1500", sign: "debit" },
  "1A": { code: "2200", sign: "credit" },
  "1B": { code: "1500", sign: "debit" },
};

export function isDrillableBox(box: string): boolean {
  return box in BOX_ACCOUNT;
}

/** Underlying lines for a VAT/BAS box. `amount` sums to the box figure. */
export async function boxTransactions(
  organizationId: string,
  box: string,
  startDate: string,
  endDate: string,
  basis: TaxBasis = "accrual"
): Promise<BoxTransaction[]> {
  const mapping = BOX_ACCOUNT[box];
  if (!mapping) return [];
  return accountTransactions(organizationId, mapping.code, mapping.sign, startDate, endDate, basis);
}
