import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  expenseClaim,
  expenseItem,
  journalEntry,
  journalLine,
  organization,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, ne, isNull } from "drizzle-orm";
import { getAuthContext, type AuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextEntryNumber } from "@/lib/api/journal-automation";
import { toBaseLines } from "@/lib/api/journal-automation";
import {
  MissingExchangeRateError,
  getExchangeRate,
} from "@/lib/currency/converter";
import { reverseJournalEntry } from "@/lib/api/journal-automation";

/**
 * Match an existing receipt-backed expense claim to one bank transaction
 * (founder current-account funding), and undo it.
 *
 * Economics of the match (claim not previously posted):
 *   DR the item's expense/prepaid account (claim currency, converted to base)
 *   CR  the founder current account (liability — Genba still owes the founder)
 *
 * The claim becomes `founder_funded`: no later submit/approve/pay/match can
 * recognize the same cost again. The claim keeps its items, receipts and
 * document associations; nothing else is created. One claim matches at most
 * one transaction — enforced by a unique index and re-checked under row locks.
 */

const RATE_SCALE = 1_000_000;
const CLAIM_CURRENCY_MISMATCH = "Expense claim currency does not match the bank transaction currency";
const AMOUNT_MISMATCH = "Expense claim total does not match the bank transaction amount";
const UNSUPPORTED_ACCOUNT =
  "Matching is only supported for founder current accounts: a bank account of type 'loan' with a linked GL account";
const UNSUPPORTED_STATUS = "Only draft expense claims can be founder-funded this way";

export interface MatchPreconditions {
  accountType: string;
  accountHasGl: boolean;
  claimStatus: string;
  claimCurrency: string;
  claimTotal: number;
  txAmount: number;
  txCurrency: string;
  itemCount: number;
  itemAccountId: string | null;
}

/**
 * Pure precondition checks for founder-funding a claim from a transaction.
 * Throws the first MatchExpenseConflict that fails; returns the expense item
 * to debit when everything passes. Units: integer minor units throughout.
 */
export function checkMatchPreconditions(input: MatchPreconditions): {
  accountId: string;
} {
  if (input.accountType !== "loan" || !input.accountHasGl) {
    throw new MatchExpenseConflict(UNSUPPORTED_ACCOUNT, "unsupported_account");
  }
  if (input.claimStatus !== "draft") {
    throw new MatchExpenseConflict(
      input.claimStatus === "founder_funded"
        ? "Expense claim is already founder-funded"
        : UNSUPPORTED_STATUS,
      "unsupported_status",
    );
  }
  if (input.claimCurrency !== input.txCurrency) {
    throw new MatchExpenseConflict(
      `${CLAIM_CURRENCY_MISMATCH} (${input.claimCurrency} vs ${input.txCurrency})`,
      "unsupported_status",
    );
  }
  if (Math.abs(input.txAmount) !== input.claimTotal) {
    throw new MatchExpenseConflict(
      `${AMOUNT_MISMATCH} (transaction ${Math.abs(input.txAmount)} vs claim ${input.claimTotal}, minor units)`,
      "unsupported_status",
    );
  }
  if (input.itemCount !== 1) {
    throw new MatchExpenseConflict(
      `Only one-item expense claims are supported (this claim has ${input.itemCount} items)`,
      "unsupported_status",
    );
  }
  if (!input.itemAccountId) {
    throw new MatchExpenseConflict(
      "The expense item has no account: categorize it before matching",
      "unsupported_status",
    );
  }
  return { accountId: input.itemAccountId };
}

export interface MatchExpenseResult {
  matchType: "existing_expense";
  transactionId: string;
  expenseClaimId: string;
  journalEntryId: string;
  /** True when the request was an exact retry of an existing match. */
  retry: boolean;
  /** Rate applied to the journal lines, integer scale 1,000,000. Fresh matches only. */
  appliedRate?: number;
  baseCurrency?: string;
  claimCurrency: string;
  accountingDate: string;
}

export interface UnmatchExpenseResult {
  transactionId: string;
  expenseClaimId: string;
  journalEntryId: string;
  reversalJournalEntryId: string;
}

export class MatchExpenseConflict extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "already_reconciled"
      | "expense_linked_elsewhere"
      | "unsupported_status"
      | "unsupported_account",
  ) {
    super(message);
  }
}

interface LoadedTx {
  transaction: typeof bankTransaction.$inferSelect;
  account: typeof bankAccount.$inferSelect;
}

async function loadTransaction(
  organizationId: string,
  transactionId: string,
): Promise<LoadedTx | null> {
  const transaction = await db.query.bankTransaction.findFirst({
    where: eq(bankTransaction.id, transactionId),
  });
  if (!transaction) return null;
  const account = await db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.id, transaction.bankAccountId),
      eq(bankAccount.organizationId, organizationId),
      notDeleted(bankAccount.deletedAt),
    ),
  });
  if (!account) return null;
  return { transaction, account };
}

async function loadClaim(
  organizationId: string,
  expenseClaimId: string,
): Promise<
  | (typeof expenseClaim.$inferSelect & {
      items: (typeof expenseItem.$inferSelect)[];
    })
  | null
> {
  const claim = await db.query.expenseClaim.findFirst({
    where: and(
      eq(expenseClaim.id, expenseClaimId),
      eq(expenseClaim.organizationId, organizationId),
      notDeleted(expenseClaim.deletedAt),
    ),
    with: { items: true },
  });
  return claim ?? null;
}

/** External GET currency is the bank account's; a transaction may carry its own. */
function txCurrency(
  transaction: typeof bankTransaction.$inferSelect,
  account: typeof bankAccount.$inferSelect,
): string {
  return transaction.currencyCode || account.currencyCode;
}

export async function matchExistingExpense(
  ctx: AuthContext,
  input: {
    transactionId: string;
    expenseClaimId: string;
    /** Journal (accounting) date; defaults to the transaction date. */
    date?: string;
    /**
     * Explicit historical rate, integer scale 1,000,000 (1.234567 = 1234567).
     * Audited; wins over stored rates. Without it a missing stored rate is a
     * MissingExchangeRateError (422) and nothing is written.
     */
    rateOverride?: number;
  },
): Promise<MatchExpenseResult> {
  requireRole(ctx, "manage:banking");
  requireRole(ctx, "manage:expenses");

  const loaded = await loadTransaction(ctx.organizationId, input.transactionId);
  if (!loaded) throw new MatchExpenseConflict("Bank transaction not found", "not_found");
  const { transaction, account } = loaded;

  // Exact retry: the same claim is already matched to this transaction.
  if (
    transaction.status === "reconciled" &&
    transaction.expenseClaimId === input.expenseClaimId &&
    transaction.journalEntryId
  ) {
    const claim = await loadClaim(ctx.organizationId, input.expenseClaimId);
    if (claim && claim.status === "founder_funded") {
      return {
        matchType: "existing_expense" as const,
        transactionId: transaction.id,
        expenseClaimId: claim.id,
        journalEntryId: transaction.journalEntryId,
        retry: true,
        claimCurrency: claim.currencyCode,
        accountingDate: transaction.date,
      };
    }
  }

  if (transaction.status !== "unreconciled") {
    throw new MatchExpenseConflict("Transaction already reconciled", "already_reconciled");
  }

  const claim = await loadClaim(ctx.organizationId, input.expenseClaimId);
  if (!claim) throw new MatchExpenseConflict("Expense claim not found", "not_found");

  const accountingDate = input.date || transaction.date;
  const currency = txCurrency(transaction, account);

  checkMatchPreconditions({
    accountType: account.accountType,
    accountHasGl: !!account.chartAccountId,
    claimStatus: claim.status,
    claimCurrency: claim.currencyCode,
    claimTotal: claim.totalAmount,
    txAmount: transaction.amount,
    txCurrency: currency,
    itemCount: claim.items.length,
    itemAccountId: claim.items[0]?.accountId ?? null,
  });
  const item = claim.items[0];

  // The claim must not already be linked to another transaction.
  // The claim must not already be linked to another transaction.
  const existingLink = await db.query.bankTransaction.findFirst({
    where: and(
      eq(bankTransaction.expenseClaimId, claim.id),
      ne(bankTransaction.id, transaction.id),
    ),
  });
  if (existingLink) {
    throw new MatchExpenseConflict(
      "Expense claim is already matched to another bank transaction",
      "expense_linked_elsewhere",
    );
  }

  // --- Rate resolution (before any write; throws 422 when unusable) ---
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, ctx.organizationId),
  });
  const baseCurrency = org?.defaultCurrency || "USD";
  let rate: number;
  if (input.rateOverride != null) {
    if (!Number.isInteger(input.rateOverride) || input.rateOverride <= 0) {
      throw new MatchExpenseConflict(
        "rateOverride must be a positive integer on a 1,000,000 scale (1.234567 = 1234567)",
        "unsupported_status",
      );
    }
    rate = input.rateOverride;
  } else if (currency === baseCurrency) {
    rate = RATE_SCALE;
  } else {
    const stored = await getExchangeRate(ctx.organizationId, currency, baseCurrency, accountingDate);
    if (stored == null) {
      throw new MissingExchangeRateError(currency, baseCurrency, accountingDate);
    }
    rate = stored;
  }

  await assertNotLocked(ctx.organizationId, accountingDate, ctx);

  const founderGlAccountId = account.chartAccountId;
  const journalDescription = `Founder funding: ${claim.title} — ${account.accountName}`;

  return db.transaction(async (tx) => {
    // Authoritative re-checks under row locks: concurrent matches, approvals,
    // or reconciliations lose here rather than double-posting.
    const [lockedTx] = await tx
      .select()
      .from(bankTransaction)
      .where(eq(bankTransaction.id, transaction.id))
      .for("update");
    if (lockedTx.status !== "unreconciled") {
      if (
        lockedTx.status === "reconciled" &&
        lockedTx.expenseClaimId === claim.id &&
        lockedTx.journalEntryId
      ) {
        return {
          matchType: "existing_expense" as const,
          transactionId: lockedTx.id,
          expenseClaimId: claim.id,
          journalEntryId: lockedTx.journalEntryId,
          retry: true,
          appliedRate: rate,
          baseCurrency,
          claimCurrency: claim.currencyCode,
          accountingDate,
        };
      }
      throw new MatchExpenseConflict("Transaction already reconciled", "already_reconciled");
    }
    const [lockedClaim] = await tx
      .select()
      .from(expenseClaim)
      .where(eq(expenseClaim.id, claim.id))
      .for("update");
    if (lockedClaim.status !== "draft") {
      throw new MatchExpenseConflict(
        lockedClaim.status === "founder_funded"
          ? "Expense claim is already founder-funded"
          : UNSUPPORTED_STATUS,
        "unsupported_status",
      );
    }

    const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
    const [entry] = await tx
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: accountingDate,
        description: journalDescription,
        reference: transaction.reference || transaction.description.slice(0, 60),
        status: "posted",
        sourceType: "expense_claim_match",
        sourceId: claim.id,
        createdBy: ctx.userId,
        postedAt: new Date(),
      })
      .returning();

    // DR the item's account, CR the founder current account. Amounts are in
    // the claim/transaction currency (minor units); toBaseLines converts to
    // the company base currency and stamps currencyCode + exchangeRate.
    const lines = [
      {
        journalEntryId: entry.id,
        accountId: item.accountId!,
        description: item.description,
        debitAmount: item.amount,
        creditAmount: 0,
        costCenterId: item.costCenterId ?? null,
      },
      {
        journalEntryId: entry.id,
        accountId: founderGlAccountId!,
        description: `Founder funding — still owed to the founder`,
        debitAmount: 0,
        creditAmount: item.amount,
      },
    ];
    const baseLines = toBaseLines(lines, currency, rate);
    await tx.insert(journalLine).values(baseLines);

    await tx
      .update(bankTransaction)
      .set({
        status: "reconciled",
        journalEntryId: entry.id,
        expenseClaimId: claim.id,
        accountId: item.accountId,
      })
      .where(eq(bankTransaction.id, transaction.id));

    await tx
      .update(expenseClaim)
      .set({ status: "founder_funded", journalEntryId: entry.id, updatedAt: new Date() })
      .where(eq(expenseClaim.id, claim.id));

    return {
      matchType: "existing_expense" as const,
      transactionId: transaction.id,
      expenseClaimId: claim.id,
      journalEntryId: entry.id,
      retry: false,
      appliedRate: rate,
      baseCurrency,
      claimCurrency: currency,
      accountingDate,
    };
  }).then(async (result) => {
    if (!result.retry) {
      await db.insert(auditLog).values({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "matched_existing_expense",
        entityType: "bank_transaction",
        entityId: input.transactionId,
        changes: {
          expenseClaimId: input.expenseClaimId,
          journalEntryId: result.journalEntryId,
          fundingMethod: "founder_current_account",
          founderChartAccountId: founderGlAccountId,
          accountingDate,
          claimCurrency: result.claimCurrency,
          baseCurrency,
          exchangeRate: rate,
          rateOverridden: input.rateOverride != null,
        },
      });
    }
    return result;
  });
}

export async function unmatchExpense(
  ctx: AuthContext,
  input: { transactionId: string; expenseClaimId: string; reason?: string },
): Promise<UnmatchExpenseResult> {
  requireRole(ctx, "manage:banking");
  requireRole(ctx, "void:entries");

  const loaded = await loadTransaction(ctx.organizationId, input.transactionId);
  if (!loaded) throw new MatchExpenseConflict("Bank transaction not found", "not_found");
  const { transaction } = loaded;

  if (
    transaction.status !== "reconciled" ||
    !transaction.journalEntryId ||
    transaction.expenseClaimId !== input.expenseClaimId
  ) {
    throw new MatchExpenseConflict(
      "This transaction is not matched to that expense claim",
      "already_reconciled",
    );
  }

  const claim = await loadClaim(ctx.organizationId, input.expenseClaimId);
  if (!claim) throw new MatchExpenseConflict("Expense claim not found", "not_found");
  if (claim.status !== "founder_funded" || claim.journalEntryId !== transaction.journalEntryId) {
    throw new MatchExpenseConflict(
      "Expense claim is not in founder-funded state for this match",
      "unsupported_status",
    );
  }

  const entry = await db.query.journalEntry.findFirst({
    where: and(
      eq(journalEntry.id, transaction.journalEntryId!),
      eq(journalEntry.organizationId, ctx.organizationId),
      isNull(journalEntry.deletedAt),
    ),
  });
  if (!entry) throw new MatchExpenseConflict("Journal entry not found", "not_found");
  if (entry.status !== "posted" || entry.reversedByEntryId) {
    throw new MatchExpenseConflict(
      "The match journal entry is already reversed or voided",
      "already_reconciled",
    );
  }

  // The reversal posts on the original entry's date, so the original period
  // must be open (or the caller may bypass the lock).
  await assertNotLocked(ctx.organizationId, entry.date, ctx);

  return db.transaction(async (tx) => {
    const [lockedTx] = await tx
      .select()
      .from(bankTransaction)
      .where(eq(bankTransaction.id, transaction.id))
      .for("update");
    if (
      lockedTx.status !== "reconciled" ||
      lockedTx.expenseClaimId !== input.expenseClaimId ||
      lockedTx.journalEntryId !== transaction.journalEntryId
    ) {
      throw new MatchExpenseConflict("Match changed concurrently", "already_reconciled");
    }
    const [lockedClaim] = await tx
      .select()
      .from(expenseClaim)
      .where(eq(expenseClaim.id, claim.id))
      .for("update");
    if (lockedClaim.status !== "founder_funded") {
      throw new MatchExpenseConflict("Expense claim changed concurrently", "unsupported_status");
    }

    const reversal = await reverseJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        entryId: entry.id,
        date: entry.date,
        description: `Reversal of founder funding match: ${claim.title}${input.reason ? ` — ${input.reason}` : ""}`,
        reference: entry.reference,
        sourceType: "expense_claim_match_undo",
        sourceId: claim.id,
      },
      tx,
    );
    await tx
      .update(journalEntry)
      .set({ voidedAt: new Date(), voidReason: input.reason || "Founder-funding match undone", updatedAt: new Date() })
      .where(eq(journalEntry.id, entry.id));

    // Release the match and restore actionable states. Documents, receipt
    // keys and item rows are untouched throughout.
    await tx
      .update(bankTransaction)
      .set({ status: "unreconciled", journalEntryId: null, expenseClaimId: null })
      .where(eq(bankTransaction.id, transaction.id));
    await tx
      .update(expenseClaim)
      .set({ status: "draft", journalEntryId: null, updatedAt: new Date() })
      .where(eq(expenseClaim.id, claim.id));

    return {
      transactionId: transaction.id,
      expenseClaimId: claim.id,
      journalEntryId: entry.id,
      reversalJournalEntryId: reversal?.id || "",
    };
  }).then(async (result) => {
    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "unmatched_existing_expense",
      entityType: "bank_transaction",
      entityId: input.transactionId,
      changes: {
        expenseClaimId: input.expenseClaimId,
        journalEntryId: result.journalEntryId,
        reversalJournalEntryId: result.reversalJournalEntryId,
        reason: input.reason || null,
      },
    });
    return result;
  });
}
