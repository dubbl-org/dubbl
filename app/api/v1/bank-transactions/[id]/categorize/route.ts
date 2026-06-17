import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, chartAccount, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createCategorizationJournalEntry, assertBaseRateAvailable } from "@/lib/api/journal-automation";
import { z } from "zod";

// Code a bank transaction directly to a ledger account ("Categorize"). This is
// the generic money-in / money-out posting used for income, expenses, loans
// received, owner contributions, transfers, owner drawings, etc. — the account
// chosen for the other side determines the meaning; the double entry follows
// from the sign of the transaction amount.
const categorizeSchema = z.object({
  accountId: z.string().min(1).describe("Chart-of-accounts account to post the other side to"),
  contactId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
    });
    if (!transaction) return notFound("Bank transaction");

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!account) return notFound("Bank transaction");

    if (transaction.status === "reconciled") {
      return NextResponse.json({ error: "Transaction already reconciled" }, { status: 400 });
    }

    if (!account.chartAccountId) {
      return validationError(
        "This bank account isn't linked to a ledger account yet. Set its ledger account in the bank account settings before categorizing transactions."
      );
    }

    const body = await request.json();
    const parsed = categorizeSchema.parse(body);

    // Verify the chosen account belongs to this org.
    const target = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, parsed.accountId),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });
    if (!target) return notFound("Account");

    const currencyCode = transaction.currencyCode || account.currencyCode;

    // Pre-flight the FX rate so a missing rate fails cleanly (422) before writes.
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

    const { entry } = await db.transaction(async (tx) => {
      const entry = await createCategorizationJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          bankGlAccountId: account.chartAccountId!,
          otherAccountId: parsed.accountId,
          amount: transaction.amount,
          date: transaction.date,
          reference: transaction.reference || transaction.description,
          description: parsed.memo?.trim() || transaction.description,
          currencyCode,
          taxRateId: parsed.taxRateId || null,
        },
        tx
      );

      await tx
        .update(bankTransaction)
        .set({
          status: "reconciled",
          accountId: parsed.accountId,
          contactId: parsed.contactId || null,
          taxRateId: parsed.taxRateId || null,
          journalEntryId: entry?.id || null,
        })
        .where(eq(bankTransaction.id, id));

      return { entry };
    });

    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "categorized",
      entityType: "bank_transaction",
      entityId: id,
      changes: { accountId: parsed.accountId, journalEntryId: entry?.id || null, amount: transaction.amount },
    });

    return NextResponse.json({ journalEntryId: entry?.id || null }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
