import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  bankAccount,
  bankTransaction,
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
import { assertNotLocked } from "@/lib/api/period-lock";
import { decimalToMinorUnits } from "@/lib/money";
import { z } from "zod";

// Standalone bank transfer: move money between the org's OWN bank/cash accounts
// without an imported statement line to match against. A transfer has no P&L
// impact — it is a single balanced journal entry that DEBITS the receiving
// bank's ledger account and CREDITS the sending bank's ledger account (both are
// asset accounts, so it is a pure balance-sheet reclassification).
//
// On success this posts ONE journal entry (DR to-bank / CR from-bank) and
// records the two halves of the transfer as paired, already-reconciled bank
// transactions (money out of the from-account, money in to the to-account) so
// both accounts' running balances reflect the move. The two transactions share
// a transferGroupId and reference each other via transferTransactionId.
//
// POST body amounts are decimal in the transfer currency (e.g. 12.50), not
// minor units — converted to the currency's real minor units server-side.
const createSchema = z.object({
  fromBankAccountId: z
    .string()
    .min(1)
    .describe("The own bank/cash account the money leaves"),
  toBankAccountId: z
    .string()
    .min(1)
    .describe("The own bank/cash account the money arrives in"),
  amount: z
    .number()
    .positive()
    .describe("Amount to move, as a decimal in the transfer currency (e.g. 12.50)"),
  date: z.string().min(1).describe("Transfer date (YYYY-MM-DD)"),
  memo: z.string().nullable().optional().describe("Optional note for the transfer"),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    if (parsed.fromBankAccountId === parsed.toBankAccountId) {
      return validationError("A transfer must be between two different accounts.");
    }

    await assertNotLocked(ctx.organizationId, parsed.date);

    // Both accounts must be the org's own, not deleted.
    const fromAccount = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, parsed.fromBankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!fromAccount) return notFound("From account");

    const toAccount = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, parsed.toBankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!toAccount) return notFound("To account");

    // Cross-currency FX transfers are out of scope: both legs are booked at the
    // same amount, so mismatched currencies would post an unbalanced/mis-scaled
    // journal entry. Reject before any writes.
    if (fromAccount.currencyCode !== toAccount.currencyCode) {
      return validationError("Transfers must be between accounts in the same currency.");
    }

    // Both banks must post to a ledger account; connect them automatically so a
    // transfer never hits a dead end (older accounts self-heal on first use).
    const fromGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, fromAccount);
    const toGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, toAccount);

    // The transfer is booked in the source account's currency. Convert the
    // decimal amount to that currency's real minor units.
    const currencyCode = fromAccount.currencyCode;
    const abs = decimalToMinorUnits(parsed.amount, currencyCode);
    if (abs <= 0) {
      return validationError("Transfer amount must be greater than zero.");
    }

    // Pre-flight the FX rate so a missing rate fails cleanly (422) before writes.
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, parsed.date);

    const memo = parsed.memo?.trim() || null;
    const description = `Transfer ${fromAccount.accountName} → ${toAccount.accountName}`;
    const reference = memo;

    const { entry } = await db.transaction(async (tx) => {
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);

      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: parsed.date,
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
        parsed.date
      );

      // DR the receiving bank, CR the sending bank (both asset accounts).
      const lines: (typeof journalLine.$inferInsert)[] = [
        {
          journalEntryId: entry.id,
          accountId: toGlAccountId,
          description,
          debitAmount: abs,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: fromGlAccountId,
          description,
          debitAmount: 0,
          creditAmount: abs,
        },
      ];
      await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

      // Record both halves as paired, already-reconciled bank transactions so
      // each account's balance reflects the move.
      const transferGroupId = randomUUID();

      const [outLine] = await tx
        .insert(bankTransaction)
        .values({
          bankAccountId: fromAccount.id,
          date: parsed.date,
          description,
          reference,
          amount: -abs,
          currencyCode,
          status: "reconciled",
          sourceType: "transfer",
          journalEntryId: entry.id,
          transferGroupId,
        })
        .returning();

      const [inLine] = await tx
        .insert(bankTransaction)
        .values({
          bankAccountId: toAccount.id,
          date: parsed.date,
          description,
          reference,
          amount: abs,
          currencyCode,
          status: "reconciled",
          sourceType: "transfer",
          journalEntryId: entry.id,
          transferTransactionId: outLine.id,
          transferGroupId,
        })
        .returning();

      await tx
        .update(bankTransaction)
        .set({ transferTransactionId: inLine.id })
        .where(eq(bankTransaction.id, outLine.id));

      return { entry };
    });

    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "create",
      entityType: "bank_transfer",
      entityId: entry.id,
      changes: {
        fromBankAccountId: fromAccount.id,
        toBankAccountId: toAccount.id,
        amount: abs,
        currencyCode,
        journalEntryId: entry.id,
      },
    });

    return NextResponse.json(
      { journalEntryId: entry.id },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
