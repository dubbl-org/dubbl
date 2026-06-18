/**
 * Pure helpers for choosing where a bank account's ledger (GL) account lives.
 *
 * Kept free of any database import so the band/code logic can be unit-tested in
 * isolation (the DB-touching orchestration lives in bank-ledger.ts).
 */

export type BankBand = {
  type: "asset" | "liability";
  subType: string;
  /** Lowest code in the band (inclusive). */
  lo: number;
  /** Highest code in the band (inclusive). */
  hi: number;
  /** The standard code for this account type (e.g. 1100 for checking). */
  preferred: number;
  /** Standard name used when creating the first account of this type. */
  defaultName: string;
};

/**
 * Where each kind of bank account lives on the balance sheet, and which code
 * band its ledger account is drawn from. Asset-type accounts (cash you hold)
 * use the bank band 1100–1199; credit cards and loans are money you owe, so
 * they land in the liability band 2600–2699.
 */
export function bandFor(accountType: string): BankBand {
  switch (accountType) {
    case "credit_card":
      return { type: "liability", subType: "current", lo: 2600, hi: 2699, preferred: 2600, defaultName: "Credit Card" };
    case "loan":
      return { type: "liability", subType: "current", lo: 2600, hi: 2699, preferred: 2610, defaultName: "Loan Account" };
    case "savings":
      return { type: "asset", subType: "bank", lo: 1100, hi: 1199, preferred: 1110, defaultName: "Savings Account" };
    case "checking":
      return { type: "asset", subType: "bank", lo: 1100, hi: 1199, preferred: 1100, defaultName: "Checking Account" };
    case "cash":
      return { type: "asset", subType: "bank", lo: 1100, hi: 1199, preferred: 1120, defaultName: "Cash Account" };
    case "investment":
      return { type: "asset", subType: "bank", lo: 1100, hi: 1199, preferred: 1130, defaultName: "Investment Account" };
    default:
      return { type: "asset", subType: "bank", lo: 1100, hi: 1199, preferred: 1140, defaultName: "Bank Account" };
  }
}

/**
 * Pick a chart-of-accounts code in the band that isn't already used. Prefers the
 * band's standard code (e.g. 1100 for checking) and otherwise walks the band for
 * the first free slot. `taken` must include soft-deleted accounts too, since the
 * (org, code) unique index spans them. Returns null when the band is exhausted.
 */
export function pickCode(band: BankBand, taken: Set<string>): string | null {
  if (!taken.has(String(band.preferred))) return String(band.preferred);
  for (let c = band.lo; c <= band.hi; c++) {
    const code = String(c);
    if (!taken.has(code)) return code;
  }
  return null;
}
