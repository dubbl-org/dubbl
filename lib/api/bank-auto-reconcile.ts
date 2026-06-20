import { db } from "@/lib/db";
import {
  bankAccount,
  bankTransaction,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { findMatches, type BankTransactionForMatch, type MatchCandidate } from "@/lib/banking/reconciliation-matcher";

export async function autoReconcileBankTransactions(
  organizationId: string,
  options?: { bankAccountId?: string; confidenceThreshold?: number }
): Promise<{ checked: number; reconciled: number; skipped: number }> {
  const threshold = options?.confidenceThreshold ?? 85;

  // Get org's bank account IDs
  const bankAccountConditions = [
    eq(bankAccount.organizationId, organizationId),
    notDeleted(bankAccount.deletedAt),
    eq(bankAccount.isActive, true),
  ];

  if (options?.bankAccountId) {
    bankAccountConditions.push(eq(bankAccount.id, options.bankAccountId));
  }

  const orgAccounts = await db
    .select({ id: bankAccount.id, chartAccountId: bankAccount.chartAccountId })
    .from(bankAccount)
    .where(and(...bankAccountConditions));

  if (orgAccounts.length === 0) return { checked: 0, reconciled: 0, skipped: 0 };

  const accountIds = orgAccounts.map((a) => a.id);
  // The ledger (chart) accounts these bank accounts post to. We only ever
  // auto-link a bank line to a posted entry that actually moves one of these
  // accounts — i.e. a real cash entry (a recorded payment, a manual bank
  // entry) — never to a revenue/expense recognition entry.
  const bankGlAccountIds = orgAccounts
    .map((a) => a.chartAccountId)
    .filter((x): x is string => !!x);

  // Get unreconciled transactions
  const unreconciledTxs = await db
    .select()
    .from(bankTransaction)
    .where(
      and(
        sql`${bankTransaction.bankAccountId} IN (${sql.join(
          accountIds.map((id) => sql`${id}`),
          sql`, `
        )})`,
        eq(bankTransaction.status, "unreconciled"),
        isNull(bankTransaction.journalEntryId)
      )
    )
    .limit(500);

  if (unreconciledTxs.length === 0) return { checked: 0, reconciled: 0, skipped: 0 };

  // Open invoices/bills are NOT auto-reconciled here: reconciling one means
  // recording a received/made payment (DR Bank / CR AR, or DR AP / CR Bank) and
  // relieving the document — a money-movement decision that must not happen in
  // an unattended job. Marking the line "reconciled" against an open document
  // (as this used to) left the invoice unpaid, recorded no cash, and silently
  // corrupted AR/AP and the bank. Those are left for the user to match, which
  // records the payment correctly.

  // The only safe automatic action is linking a bank line to an ALREADY-POSTED
  // cash entry that hits one of this org's bank ledger accounts and isn't
  // already linked to another bank line (e.g. a payment posted manually, or a
  // categorization on a different account). Without a bank ledger account there
  // is nothing safe to match against.
  if (bankGlAccountIds.length === 0) {
    return { checked: 0, reconciled: 0, skipped: unreconciledTxs.length };
  }

  // Entries already tied to a bank transaction must not be re-linked.
  const linkedRows = await db
    .select({ jid: bankTransaction.journalEntryId })
    .from(bankTransaction)
    .where(
      and(
        sql`${bankTransaction.bankAccountId} IN (${sql.join(
          accountIds.map((id) => sql`${id}`),
          sql`, `
        )})`,
        sql`${bankTransaction.journalEntryId} is not null`
      )
    );
  const linkedEntryIds = new Set(linkedRows.map((r) => r.jid).filter(Boolean) as string[]);

  // Posted entries that move a bank ledger account (real cash entries), with the
  // net movement on that bank account as the matchable amount.
  const cashEntries = await db
    .select({
      id: journalEntry.id,
      date: journalEntry.date,
      description: journalEntry.description,
      reference: journalEntry.reference,
      bankDelta: sql<number>`coalesce(sum(${journalLine.debitAmount} - ${journalLine.creditAmount}), 0)`,
    })
    .from(journalEntry)
    .innerJoin(journalLine, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt),
        sql`${journalLine.accountId} IN (${sql.join(
          bankGlAccountIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .groupBy(journalEntry.id, journalEntry.date, journalEntry.description, journalEntry.reference)
    .limit(500);

  const entryCandidates: MatchCandidate[] = cashEntries
    .filter((e) => !linkedEntryIds.has(e.id))
    .map((e) => ({
      type: "journal_entry",
      id: e.id,
      date: e.date,
      description: e.description ?? "",
      // Signed bank movement: +inflow / -outflow, matching the bank line's sign.
      amount: Number(e.bankDelta),
      reference: e.reference,
    }));

  let checked = 0;
  let reconciled = 0;
  let skipped = 0;

  for (const tx of unreconciledTxs) {
    checked++;

    const txForMatch: BankTransactionForMatch = {
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      reference: tx.reference,
    };

    // No invoice/bill candidates — only safe links to existing cash entries.
    const matches = findMatches(txForMatch, [], [], entryCandidates);

    if (
      matches.length > 0 &&
      matches[0].confidence >= threshold &&
      matches[0].candidate.type === "journal_entry" &&
      !linkedEntryIds.has(matches[0].candidate.id)
    ) {
      const entryId = matches[0].candidate.id;
      await db
        .update(bankTransaction)
        .set({ journalEntryId: entryId, status: "reconciled" })
        .where(eq(bankTransaction.id, tx.id));
      // Don't link the same entry to a second bank line in this pass.
      linkedEntryIds.add(entryId);
      reconciled++;
    } else {
      skipped++;
    }
  }

  return { checked, reconciled, skipped };
}
