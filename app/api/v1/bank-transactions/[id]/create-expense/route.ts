import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  chartAccount,
  expenseClaim,
  expenseItem,
  organization,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { decimalToCents } from "@/lib/money";
import {
  createCategorizationJournalEntry,
  assertBaseRateAvailable,
  ensureAccountByCode,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const itemSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().min(0),
  category: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.default("USD"),
  items: z.array(itemSchema).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:expenses");

    // Verify transaction ownership
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
      return NextResponse.json(
        { error: "Transaction already reconciled" },
        { status: 400 }
      );
    }

    // The reconcile UI keys off journalEntryId, so we can only flip the line to
    // "reconciled" once we have actually posted the matching GL entry — which
    // requires the bank account to be connected to a ledger account. We connect
    // it automatically here rather than erroring, so the user never hits a dead
    // end (older accounts created before auto-linking self-heal on first use).
    const bankGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, account);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Calculate total from items
    let totalAmount = 0;
    const processedItems = parsed.items.map((item, i) => {
      const amount = decimalToCents(item.amount);
      totalAmount += amount;
      return {
        date: item.date,
        description: item.description,
        amount,
        category: item.category || null,
        accountId: item.accountId || null,
        receiptFileKey: null,
        receiptFileName: null,
        sortOrder: i,
      };
    });

    // Resolve the expense ledger account to debit. If the items name a single
    // distinct account, use it (after verifying it belongs to this org);
    // otherwise fall back to the Miscellaneous Expense control account so the
    // expense always hits the ledger.
    const namedAccountIds = Array.from(
      new Set(
        processedItems
          .map((item) => item.accountId)
          .filter((accId): accId is string => !!accId)
      )
    );

    let expenseAccountId: string | null = null;
    if (namedAccountIds.length === 1) {
      const target = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.id, namedAccountIds[0]),
          eq(chartAccount.organizationId, ctx.organizationId)
        ),
      });
      if (!target) return notFound("Account");
      expenseAccountId = target.id;
    } else {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const base = org?.defaultCurrency ?? "USD";
      const fallback = await ensureAccountByCode(
        ctx.organizationId,
        {
          code: "5990",
          name: "Miscellaneous Expense",
          type: "expense",
          subType: "operating",
        },
        base
      );
      expenseAccountId = fallback?.id ?? null;
    }

    // If we can't resolve an expense account, do NOT flip the line to
    // reconciled — that would leave a reconciled line with no GL impact.
    if (!expenseAccountId) {
      return validationError(
        "Couldn't resolve an expense account to post this expense to. Pick an expense category before creating the expense."
      );
    }

    const currencyCode = transaction.currencyCode || account.currencyCode;

    // Pre-flight the FX rate so a missing rate fails cleanly (422) before writes.
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

    const { created, entry } = await db.transaction(async (tx) => {
      // Create expense claim
      const [created] = await tx
        .insert(expenseClaim)
        .values({
          organizationId: ctx.organizationId,
          title: parsed.title,
          description: parsed.description || null,
          submittedBy: ctx.userId,
          totalAmount,
          currencyCode: parsed.currencyCode,
        })
        .returning();

      await tx.insert(expenseItem).values(
        processedItems.map((item) => ({
          expenseClaimId: created.id,
          ...item,
        }))
      );

      // Post the GL entry: DR expense / CR bank, driven by the signed bank
      // movement so the bank ledger ties to the feed.
      const entry = await createCategorizationJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          bankGlAccountId,
          otherAccountId: expenseAccountId!,
          amount: transaction.amount,
          date: transaction.date,
          reference: transaction.reference || transaction.description,
          description: parsed.title || transaction.description,
          currencyCode,
        },
        tx
      );

      // Only flip the line to reconciled once the GL entry exists and is linked
      // (createCategorizationJournalEntry returns null for a zero-amount line);
      // the reconcile UI keys off journalEntryId, so never report reconciled
      // without a posted entry.
      if (entry?.id) {
        await tx
          .update(bankTransaction)
          .set({
            status: "reconciled",
            accountId: expenseAccountId,
            journalEntryId: entry.id,
          })
          .where(eq(bankTransaction.id, id));
      } else {
        await tx
          .update(bankTransaction)
          .set({ accountId: expenseAccountId })
          .where(eq(bankTransaction.id, id));
      }

      return { created, entry };
    });

    logAudit({ ctx, action: "create", entityType: "expense", entityId: created.id, changes: { bankTransactionId: id, amount: totalAmount, journalEntryId: entry?.id ?? null }, request });

    return NextResponse.json({ expenseClaim: created, journalEntryId: entry?.id ?? null }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
