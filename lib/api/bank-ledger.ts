import { db } from "@/lib/db";
import { bankAccount, chartAccount } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { bandFor, pickCode } from "@/lib/api/bank-ledger-codes";

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
 * Ensure a bank account is connected to a ledger (GL) account, creating/linking
 * one on demand, and return that ledger account's id.
 *
 * Every bank movement we post (categorising, creating an expense, matching a
 * transfer, reconciling) must debit/credit a balance-sheet account so the books
 * stay in balance. Rather than make the user set this up, we connect it for them:
 *
 *  1. Reuse the standard account for this type (e.g. 1100 Checking) when it
 *     already exists and isn't tied to another bank account — so a typical
 *     one-account business keeps a clean, standard chart with no extra accounts.
 *  2. Otherwise allocate an additional account in the right band, named after
 *     the bank account so it's identifiable. This only happens when the standard
 *     slot is already taken (e.g. a second checking account), which keeps the
 *     one-ledger-account-per-bank-account rule that lets each reconcile on its own.
 *
 * The account is marked `isSystem` so the control account can't be deleted or
 * retyped out from under the feed. No-op when already linked. Pass the
 * surrounding `exec` when calling inside a db.transaction so the new account
 * commits/rolls back with the caller's writes.
 */
export async function ensureBankLedgerAccount(
  organizationId: string,
  account: BankAccountLike,
  exec: DbOrTx = db
): Promise<string> {
  if (account.chartAccountId) return account.chartAccountId;

  const band = bandFor(account.accountType);
  const currencyCode = account.currencyCode || "USD";

  // 1. Reuse the standard account for this type when present and unclaimed.
  const standard = await exec.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, String(band.preferred)),
      isNull(chartAccount.deletedAt)
    ),
    columns: { id: true },
  });
  if (standard) {
    // Don't reuse it if any bank account (even a deleted one, whose journal
    // history still references it) is already tied to it — sharing one GL
    // account across two bank accounts would commingle their balances.
    const claimed = await exec.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.organizationId, organizationId),
        eq(bankAccount.chartAccountId, standard.id)
      ),
      columns: { id: true },
    });
    if (!claimed) {
      await exec
        .update(bankAccount)
        .set({ chartAccountId: standard.id })
        .where(eq(bankAccount.id, account.id));
      return standard.id;
    }
  }

  // 2. Allocate an additional account. Retry to absorb the rare race where two
  // accounts are created at once and a concurrent insert claims our code first;
  // re-reading existing codes each pass steps past whatever was just taken.
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

    // A fresh standard account (band's preferred code is free) keeps the standard
    // name so the chart reads normally; any further account is named after the
    // bank account so it's identifiable in reports.
    const name =
      code === String(band.preferred)
        ? band.defaultName
        : account.accountName?.trim() || band.defaultName;

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
