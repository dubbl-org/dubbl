import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createCategorizationJournalEntry, resolveBaseRate } from "@/lib/api/journal-automation";
import { logAudit } from "@/lib/api/audit";
import { MissingExchangeRateError } from "@/lib/currency/converter";
import { z } from "zod";

// Bulk "cash coding": code many bank transactions to ledger accounts in one
// pass. This is the batch version of the single-transaction Categorize action —
// the generic money-in / money-out posting (income, expense, loan received,
// owner contribution, transfer, drawings, ...) where the chosen account
// determines the meaning and the double entry follows from the sign of the
// bank amount. Amounts throughout are integer cents.
//
// Each item is posted in its OWN db.transaction (mirroring the MCP
// bulk_cash_code tool) so a DB-level failure on one item rolls back ONLY that
// item and the rest of the batch still commits. Per-item failures (transaction
// not found, not this org's, already reconciled, bank account not linked to a
// ledger account, target account missing, a missing FX rate, or any DB error
// during posting) are isolated: the item is reported as a failure and skipped.
const itemSchema = z.object({
  transactionId: z.string().min(1).describe("Bank transaction to code"),
  accountId: z.string().min(1).describe("Chart-of-accounts account to post the other side to"),
  contactId: z.string().nullable().optional().describe("Optional contact to attribute the transaction to"),
  taxRateId: z.string().nullable().optional().describe("Optional tax rate to split the (tax-inclusive) amount into net + tax"),
  memo: z.string().nullable().optional().describe("Optional memo; falls back to the transaction description"),
  costCenterId: z.string().nullable().optional().describe("Optional cost center to tag the transaction with"),
  projectId: z.string().nullable().optional().describe("Optional project to tag the transaction with"),
});

const bulkSchema = z.object({
  items: z.array(itemSchema).min(1).describe("Bank transactions to categorize"),
});

type ItemResult = {
  transactionId: string;
  success: boolean;
  journalEntryId?: string | null;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const { items } = bulkSchema.parse(body);

    const results: ItemResult[] = [];

    // Cache org-scoped bank-account + chart-account lookups across items in the
    // batch. These reads are independent of any item's transaction, so they
    // stay outside the per-item db.transaction.
    const bankAccountCache = new Map<
      string,
      { chartAccountId: string | null; currencyCode: string | null } | null
    >();
    const targetAccountCache = new Map<string, boolean>();

    for (const item of items) {
      try {
        // Load the bank transaction.
        const transaction = await db.query.bankTransaction.findFirst({
          where: eq(bankTransaction.id, item.transactionId),
        });
        if (!transaction) {
          results.push({ transactionId: item.transactionId, success: false, error: "Bank transaction not found" });
          continue;
        }

        // Resolve + org-scope the owning bank account (cached). A transaction
        // that isn't this org's resolves to null → skipped as not found, so
        // we never touch another org's data.
        let bankAcct = bankAccountCache.get(transaction.bankAccountId);
        if (bankAcct === undefined) {
          const found = await db.query.bankAccount.findFirst({
            where: and(
              eq(bankAccount.id, transaction.bankAccountId),
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt)
            ),
            columns: { chartAccountId: true, currencyCode: true },
          });
          bankAcct = found ?? null;
          bankAccountCache.set(transaction.bankAccountId, bankAcct);
        }
        if (!bankAcct) {
          results.push({ transactionId: item.transactionId, success: false, error: "Bank transaction not found" });
          continue;
        }

        if (transaction.status === "reconciled") {
          results.push({ transactionId: item.transactionId, success: false, error: "Transaction already reconciled" });
          continue;
        }

        if (!bankAcct.chartAccountId) {
          results.push({
            transactionId: item.transactionId,
            success: false,
            error: "This bank account isn't linked to a ledger account yet. Set its ledger account before categorizing.",
          });
          continue;
        }

        // Verify the chosen account belongs to this org (cached).
        let targetOk = targetAccountCache.get(item.accountId);
        if (targetOk === undefined) {
          const target = await db.query.chartAccount.findFirst({
            where: and(
              eq(chartAccount.id, item.accountId),
              eq(chartAccount.organizationId, ctx.organizationId)
            ),
            columns: { id: true },
          });
          targetOk = !!target;
          targetAccountCache.set(item.accountId, targetOk);
        }
        if (!targetOk) {
          results.push({ transactionId: item.transactionId, success: false, error: "Account not found" });
          continue;
        }

        const currencyCode = transaction.currencyCode || bankAcct.currencyCode || undefined;

        // Pre-flight the FX rate so a missing rate fails this item cleanly
        // (without opening a transaction) while the rest of the batch
        // continues. resolveBaseRate throws MissingExchangeRateError when a
        // foreign-currency transaction has no rate on its date.
        await resolveBaseRate(ctx.organizationId, currencyCode, transaction.date);

        // Post + mark this single item inside its OWN db.transaction so a
        // DB-level error rolls back ONLY this item, leaving the rest of the
        // batch committed (the chartAccountId non-null check above is safe to
        // assert here — TS narrows it inside the closure).
        const bankGlAccountId = bankAcct.chartAccountId;
        const entry = await db.transaction(async (tx) => {
          const posted = await createCategorizationJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              bankGlAccountId,
              otherAccountId: item.accountId,
              amount: transaction.amount,
              date: transaction.date,
              reference: transaction.reference || transaction.description,
              description: item.memo?.trim() || transaction.description,
              currencyCode,
              taxRateId: item.taxRateId || null,
            },
            tx
          );

          await tx
            .update(bankTransaction)
            .set({
              status: "reconciled",
              accountId: item.accountId,
              contactId: item.contactId || null,
              taxRateId: item.taxRateId || null,
              costCenterId: item.costCenterId || null,
              projectId: item.projectId || null,
              journalEntryId: posted?.id || null,
            })
            .where(eq(bankTransaction.id, item.transactionId));

          return posted;
        });

        results.push({
          transactionId: item.transactionId,
          success: true,
          journalEntryId: entry?.id || null,
        });
      } catch (err) {
        // Isolate per-item failures (e.g. a missing FX rate or a DB error
        // during posting) so one bad item doesn't roll back the whole batch.
        const message =
          err instanceof MissingExchangeRateError
            ? err.message
            : err instanceof Error
            ? err.message
            : "Failed to categorize transaction";
        results.push({ transactionId: item.transactionId, success: false, error: message });
      }
    }

    // Audit only the items that actually posted.
    for (const r of results) {
      if (!r.success) continue;
      await logAudit({
        ctx,
        action: "categorized",
        entityType: "bank_transaction",
        entityId: r.transactionId,
        changes: { journalEntryId: r.journalEntryId ?? null, bulk: true },
        request,
      });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    return NextResponse.json(
      { results, summary: { total: results.length, succeeded, failed } },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
