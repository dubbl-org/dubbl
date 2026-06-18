import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { z } from "zod";

// Match a statement line to a transfer between the org's OWN bank accounts.
// A transfer moves cash from one bank account to another with no P&L impact:
// it is a single journal entry that debits the receiving bank's ledger account
// and credits the sending bank's ledger account (or vice versa, per the sign of
// the source line). Both legs are bank/asset accounts, so the entry nets to zero
// in the equity sense — it is purely a balance-sheet reclassification.
//
// POST body:
//   targetBankAccountId   the OTHER own bank account this transfer touches
//   counterTransactionId? the matched statement line in the target account; when
//                         given it must be the opposite sign and equal magnitude
//                         to the source line. When omitted, a mirror reconciled
//                         transaction is created in the target account so both
//                         sides of the transfer are recorded.
//
// On success: posts ONE journal entry (DR/CR the two banks' chartAccounts),
// marks BOTH bank transactions status='reconciled', links them to each other via
// transferTransactionId, stamps a shared transferGroupId, and stamps the
// journalEntryId on both.
const matchTransferSchema = z.object({
  targetBankAccountId: z
    .string()
    .min(1)
    .describe("The other own bank account this transfer moves money to/from"),
  counterTransactionId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe(
      "The matched statement line in the target bank account (opposite sign, equal amount). Omit to create a mirror reconciled transaction in the target account."
    ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Source transaction + its bank account (org-scoped via the bank account).
    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
    });
    if (!transaction) return notFound("Bank transaction");

    const sourceAccount = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!sourceAccount) return notFound("Bank transaction");

    if (transaction.status === "reconciled") {
      return NextResponse.json(
        { error: "Transaction already reconciled" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = matchTransferSchema.parse(body);

    // The two accounts must differ — a transfer is between distinct accounts.
    if (parsed.targetBankAccountId === sourceAccount.id) {
      return validationError(
        "A transfer must be between two different bank accounts."
      );
    }

    // Target bank account, org-scoped.
    const targetAccount = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, parsed.targetBankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!targetAccount) return notFound("Bank account");

    // Both banks must post to a ledger account. Connect them automatically
    // (older accounts self-heal on first use) so transfers never hit a dead end.
    const sourceGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, sourceAccount);
    const targetGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, targetAccount);

    const abs = Math.abs(transaction.amount);
    if (abs === 0) {
      return validationError("Cannot transfer a zero-amount transaction.");
    }

    // Resolve the optional counter line. When provided it must belong to the
    // target bank account, be unreconciled, and be the opposite sign / equal
    // magnitude of the source line (the same money leaving A and arriving in B).
    let counter: typeof bankTransaction.$inferSelect | null = null;
    if (parsed.counterTransactionId) {
      const found = await db.query.bankTransaction.findFirst({
        where: eq(bankTransaction.id, parsed.counterTransactionId),
      });
      if (!found) return notFound("Counter transaction");
      if (found.bankAccountId !== targetAccount.id) {
        return validationError(
          "The counter transaction must belong to the target bank account."
        );
      }
      if (found.id === transaction.id) {
        return validationError(
          "A transfer must be between two different transactions."
        );
      }
      if (found.status === "reconciled") {
        return NextResponse.json(
          { error: "Counter transaction already reconciled" },
          { status: 400 }
        );
      }
      // Opposite sign and equal magnitude: one leg is money out, the other in.
      if (
        Math.sign(found.amount) === Math.sign(transaction.amount) ||
        Math.abs(found.amount) !== abs
      ) {
        return validationError(
          "The counter transaction must be the opposite sign and equal amount to this transaction."
        );
      }
      counter = found;
    }

    // The journal entry posts the money movement between the two bank ledger
    // accounts. The source line's sign decides direction:
    //   money out of source (amount < 0): DR target bank, CR source bank
    //   money in to source  (amount > 0): DR source bank, CR target bank
    // The "in" leg is debited, the "out" leg is credited (both are assets).
    const moneyInToSource = transaction.amount > 0;
    const debitBankAccountId = moneyInToSource
      ? sourceGlAccountId
      : targetGlAccountId;
    const creditBankAccountId = moneyInToSource
      ? targetGlAccountId
      : sourceGlAccountId;

    // Transfers are booked at the source line's currency/date. Pre-flight the FX
    // rate so a missing rate fails cleanly (422) before any writes.
    const currencyCode =
      transaction.currencyCode || sourceAccount.currencyCode;
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

    const reference = transaction.reference || transaction.description;
    const description = `Transfer ${sourceAccount.accountName} → ${targetAccount.accountName}`;

    const { entry, mirrorId } = await db.transaction(async (tx) => {
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);

      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: transaction.date,
          description,
          reference,
          status: "posted",
          sourceType: "bank_transfer",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      const { currency, rate } = await resolveBaseRate(
        ctx.organizationId,
        currencyCode,
        transaction.date
      );

      const lines: (typeof journalLine.$inferInsert)[] = [
        {
          journalEntryId: entry.id,
          accountId: debitBankAccountId,
          description,
          debitAmount: abs,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: creditBankAccountId,
          description,
          debitAmount: 0,
          creditAmount: abs,
        },
      ];
      await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

      // Shared id so both legs are recognised as the two halves of one transfer.
      const transferGroupId = randomUUID();

      // Resolve the counter transaction id: either the matched line, or a new
      // mirror line created (as reconciled) in the target account.
      let counterId: string;
      if (counter) {
        counterId = counter.id;
      } else {
        const [mirror] = await tx
          .insert(bankTransaction)
          .values({
            bankAccountId: targetAccount.id,
            date: transaction.date,
            description,
            reference,
            // Opposite sign of the source line: the money arrives where it left.
            amount: -transaction.amount,
            currencyCode,
            status: "reconciled",
            sourceType: "transfer",
            journalEntryId: entry.id,
            transferTransactionId: transaction.id,
            transferGroupId,
          })
          .returning();
        counterId = mirror.id;
      }

      // Reconcile + pair the source line.
      await tx
        .update(bankTransaction)
        .set({
          status: "reconciled",
          journalEntryId: entry.id,
          transferTransactionId: counterId,
          transferGroupId,
        })
        .where(eq(bankTransaction.id, transaction.id));

      // Reconcile + pair the existing counter line (the mirror was already set).
      if (counter) {
        await tx
          .update(bankTransaction)
          .set({
            status: "reconciled",
            journalEntryId: entry.id,
            transferTransactionId: transaction.id,
            transferGroupId,
          })
          .where(eq(bankTransaction.id, counter.id));
      }

      return { entry, mirrorId: counter ? null : counterId };
    });

    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "matched_transfer",
      entityType: "bank_transaction",
      entityId: id,
      changes: {
        targetBankAccountId: targetAccount.id,
        counterTransactionId: counter?.id ?? mirrorId,
        journalEntryId: entry?.id ?? null,
        amount: transaction.amount,
        mirrorCreated: !counter,
      },
    });

    return NextResponse.json(
      {
        journalEntryId: entry?.id ?? null,
        counterTransactionId: counter?.id ?? mirrorId,
        mirrorCreated: !counter,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
