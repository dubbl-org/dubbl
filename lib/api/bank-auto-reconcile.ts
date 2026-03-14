import { db } from "@/lib/db";
import {
  bankAccount,
  bankTransaction,
  invoice,
  bill,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql, isNull, ne } from "drizzle-orm";
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
    .select({ id: bankAccount.id })
    .from(bankAccount)
    .where(and(...bankAccountConditions));

  if (orgAccounts.length === 0) return { checked: 0, reconciled: 0, skipped: 0 };

  const accountIds = orgAccounts.map((a) => a.id);

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

  // Load match candidates: unpaid invoices
  const unpaidInvoices = await db.query.invoice.findMany({
    where: and(
      eq(invoice.organizationId, organizationId),
      isNull(invoice.deletedAt),
      ne(invoice.status, "void"),
      ne(invoice.status, "paid"),
      ne(invoice.status, "draft")
    ),
  });

  const invoiceCandidates: MatchCandidate[] = unpaidInvoices.map((inv) => ({
    type: "invoice",
    id: inv.id,
    date: inv.dueDate,
    description: `Invoice ${inv.invoiceNumber}`,
    amount: inv.amountDue,
    reference: inv.invoiceNumber,
  }));

  // Load match candidates: unpaid bills
  const unpaidBills = await db.query.bill.findMany({
    where: and(
      eq(bill.organizationId, organizationId),
      isNull(bill.deletedAt),
      ne(bill.status, "void"),
      ne(bill.status, "paid"),
      ne(bill.status, "draft")
    ),
  });

  const billCandidates: MatchCandidate[] = unpaidBills.map((b) => ({
    type: "bill",
    id: b.id,
    date: b.dueDate,
    description: `Bill ${b.billNumber}`,
    amount: -b.amountDue, // Bills are outflows (negative from bank perspective)
    reference: b.billNumber,
  }));

  // Load unmatched journal entries (entries without bank transaction links)
  const unmatchedEntries = await db
    .select({
      id: journalEntry.id,
      date: journalEntry.date,
      description: journalEntry.description,
      reference: journalEntry.reference,
      totalDebit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
    })
    .from(journalEntry)
    .leftJoin(journalLine, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt)
      )
    )
    .groupBy(journalEntry.id, journalEntry.date, journalEntry.description, journalEntry.reference)
    .limit(500);

  const entryCandidates: MatchCandidate[] = unmatchedEntries.map((e) => ({
    type: "journal_entry",
    id: e.id,
    date: e.date,
    description: e.description ?? "",
    amount: Number(e.totalDebit),
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

    const matches = findMatches(txForMatch, invoiceCandidates, billCandidates, entryCandidates);

    if (matches.length > 0 && matches[0].confidence >= threshold) {
      const bestMatch = matches[0];

      if (bestMatch.candidate.type === "journal_entry") {
        // Link directly to the journal entry
        await db
          .update(bankTransaction)
          .set({
            journalEntryId: bestMatch.candidate.id,
            status: "reconciled",
          })
          .where(eq(bankTransaction.id, tx.id));
      } else {
        // For invoices/bills, try to find associated journal entry
        const relatedEntry = await db.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.organizationId, organizationId),
            eq(journalEntry.sourceId, bestMatch.candidate.id),
            eq(journalEntry.status, "posted")
          ),
        });

        if (relatedEntry) {
          await db
            .update(bankTransaction)
            .set({
              journalEntryId: relatedEntry.id,
              status: "reconciled",
            })
            .where(eq(bankTransaction.id, tx.id));
        } else {
          // Mark as reconciled even without journal entry link
          await db
            .update(bankTransaction)
            .set({ status: "reconciled" })
            .where(eq(bankTransaction.id, tx.id));
        }
      }

      reconciled++;
    } else {
      skipped++;
    }
  }

  return { checked, reconciled, skipped };
}
