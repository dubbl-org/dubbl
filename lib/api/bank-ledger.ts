import { db } from "@/lib/db";
import { bankAccount, chartAccount } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** A transaction handle, derived from db.transaction's callback parameter. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
/** Either the pool or an open transaction — for helpers that must honor a tx. */
type DbOrTx = typeof db | Tx;

/**
 * The minimal shape of a bank account this helper needs. Accepts the full
 * Drizzle row or any object carrying these fields.
 */
type BankAccountLike = {
  id: string;
  accountName: string;
  accountType: string;
  currencyCode: string;
  chartAccountId: string | null;
};

/**
 * Where each kind of bank account lives on the balance sheet, and which code
 * band its dedicated ledger account is allocated from. Asset-type accounts
 * (cash you hold) use the bank band 1100–1199; credit cards and loans are
 * money you owe, so they land in the liability band 2600–2699.
 */
function bandFor(accountType: string): {
  type: "asset" | "liability";
  subType: string;
  lo: number;
  hi: number;
  preferred: number;
  defaultName: string;
} {
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
 * Pick a chart-of-accounts code that isn't already used by this org. Prefers the
 * band's natural code (e.g. 1100 for a checking account) and otherwise walks the
 * band for the first free slot. `taken` must include soft-deleted accounts too,
 * since the (org, code) unique index spans them.
 */
function pickCode(band: ReturnType<typeof bandFor>, taken: Set<string>): string | null {
  if (!taken.has(String(band.preferred))) return String(band.preferred);
  for (let c = band.lo; c <= band.hi; c++) {
    const code = String(c);
    if (!taken.has(code)) return code;
  }
  return null;
}

/**
 * Ensure a bank account is connected to its own dedicated ledger (GL) account,
 * creating and linking one on demand, and return that ledger account's id.
 *
 * Every bank movement we post (categorising a transaction, creating an expense,
 * matching a transfer, reconciling) must debit/credit a balance-sheet account so
 * the books stay in balance. Rather than make the user pick one, we give each
 * bank account its own ledger account — named after the bank account so it reads
 * plainly in reports — so each account reconciles independently. The account is
 * marked `isSystem` so it can't be deleted or retyped out from under the feed.
 *
 * No-op when the account is already linked (returns the existing id). Pass the
 * surrounding `exec` when calling inside a db.transaction so the new ledger
 * account commits/rolls back with the caller's writes.
 */
export async function ensureBankLedgerAccount(
  organizationId: string,
  account: BankAccountLike,
  exec: DbOrTx = db
): Promise<string> {
  if (account.chartAccountId) return account.chartAccountId;

  const band = bandFor(account.accountType);
  const name = account.accountName?.trim() || band.defaultName;
  const currencyCode = account.currencyCode || "USD";

  // Retry to absorb the rare race where two accounts are created at once and a
  // concurrent insert claims our chosen code first. Re-reading existing codes
  // each pass means we step past whatever was just taken.
  for (let attempt = 0; attempt < 25; attempt++) {
    // Include soft-deleted rows: the (org, code) unique index does not exclude
    // them, so a deleted account still reserves its code.
    const existing = await exec.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, organizationId),
      columns: { code: true },
    });
    const taken = new Set(existing.map((a) => a.code));

    const code = pickCode(band, taken);
    if (!code) break; // band exhausted (≈100 accounts of one kind) — give up cleanly

    const [created] = await exec
      .insert(chartAccount)
      .values({
        organizationId,
        code,
        name,
        type: band.type,
        subType: band.subType,
        currencyCode,
        isSystem: true,
      })
      .onConflictDoNothing({ target: [chartAccount.organizationId, chartAccount.code] })
      .returning();

    if (!created) continue; // code taken by a concurrent insert — pick the next one

    await exec
      .update(bankAccount)
      .set({ chartAccountId: created.id })
      .where(eq(bankAccount.id, account.id));

    return created.id;
  }

  throw new Error(
    "Couldn't connect this bank account to your books automatically. Please contact support."
  );
}
