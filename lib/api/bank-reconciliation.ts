import { db } from "@/lib/db";
import {
  bankAccount,
  bankReconciliation,
  bankTransaction,
  chartAccount,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { AuthContext } from "@/lib/api/auth-context";
import {
  getNextEntryNumber,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  adjustmentAccountFor,
  buildReconciliationAdjustmentLines,
} from "@/lib/banking/reconciliation-adjustment";

export type ReconciliationAdjustmentResult =
  | { ok: true; journalEntryId: string; adjustmentAccountId: string; amount: number }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Write off a leftover reconciliation difference: post a balanced entry between
 * the bank's ledger account and a Bank Reconciliation Adjustments account
 * (income when `amount` > 0, expense when < 0; created on demand), dated
 * `date`. Optionally records the write-off as a reconciled line on
 * `reconciliationId` so it shows on that statement check. Shared by
 * POST /bank-accounts/[id]/reconciliation { action: "adjustment" } and the
 * write_off_reconciliation_difference MCP tool.
 *
 * `amount` is signed cents (statement minus books). Throws PeriodLockedError
 * when `date` is in a locked period or closed fiscal year.
 */
export async function postReconciliationAdjustment(
  ctx: AuthContext,
  account: typeof bankAccount.$inferSelect,
  params: {
    amount: number;
    date: string;
    description?: string;
    reconciliationId?: string;
    adjustmentAccountId?: string;
  }
): Promise<ReconciliationAdjustmentResult> {
  if (!Number.isInteger(params.amount) || params.amount === 0) {
    return { ok: false, status: 400, error: "Adjustment amount must be non-zero." };
  }

  // Never post into a locked period or a closed fiscal year.
  await assertNotLocked(ctx.organizationId, params.date, ctx);

  // Connect the bank account to its ledger account automatically (older accounts
  // self-heal on first use) so posting an adjustment never hits a dead end.
  const bankGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, account);

  const description =
    params.description?.trim() || "Bank reconciliation adjustment";

  // Resolve the org base currency for the (system) adjustment account; the
  // adjustment is posted in base currency to match the GL balance it clears.
  const { base } = await resolveBaseRate(
    ctx.organizationId,
    account.currencyCode,
    params.date
  );

  const rec = params.reconciliationId
    ? await db.query.bankReconciliation.findFirst({
        where: and(
          eq(bankReconciliation.id, params.reconciliationId),
          eq(bankReconciliation.bankAccountId, account.id)
        ),
      })
    : null;
  if (params.reconciliationId && !rec) {
    return { ok: false, status: 404, error: "Reconciliation not found" };
  }

  // Resolve / verify the adjustment account.
  let adjustmentAccountId = params.adjustmentAccountId;
  if (adjustmentAccountId) {
    const found = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, adjustmentAccountId),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });
    if (!found) return { ok: false, status: 404, error: "Account not found" };
  } else {
    const acct = await ensureAccountByCode(
      ctx.organizationId,
      adjustmentAccountFor(params.amount),
      base
    );
    if (!acct) {
      return { ok: false, status: 400, error: "Could not resolve an adjustment account." };
    }
    adjustmentAccountId = acct.id;
  }

  const reference = "RECON-ADJ";
  const lines = buildReconciliationAdjustmentLines({
    amount: params.amount,
    bankGlAccountId,
    adjustmentAccountId,
  });

  const entry = await db.transaction(async (tx) => {
    const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);

    const [entry] = await tx
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: params.date,
        description,
        reference,
        status: "posted",
        sourceType: "bank_reconciliation_adjustment",
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(journalLine).values(
      lines.map((l) => ({ journalEntryId: entry.id, description, ...l }))
    );

    // Attach the write-off to the statement check so it appears on it and
    // offsets the residual difference.
    if (rec) {
      await tx.insert(bankTransaction).values({
        bankAccountId: account.id,
        date: params.date,
        description,
        reference,
        amount: params.amount,
        status: "reconciled",
        reconciliationId: rec.id,
        journalEntryId: entry.id,
        accountId: adjustmentAccountId,
        sourceType: "reconciliation_adjustment",
        currencyCode: base,
      });
    }

    return entry;
  });

  await db.insert(auditLog).values({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "posted_reconciliation_adjustment",
    entityType: "bank_account",
    entityId: account.id,
    changes: {
      journalEntryId: entry.id,
      amount: params.amount,
      adjustmentAccountId,
      reconciliationId: params.reconciliationId || null,
    },
  });

  return {
    ok: true,
    journalEntryId: entry.id,
    adjustmentAccountId: adjustmentAccountId!,
    amount: params.amount,
  };
}
