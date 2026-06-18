import { NextResponse } from "next/server";
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
import { eq, and, desc, asc, sql, gte, lte, isNull, isNotNull, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  getNextEntryNumber,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { z } from "zod";

// Reconciliation proof + completion surface for a single bank account.
//
// GET  — proves a reconciliation: returns the reconciled vs unreconciled
//        statement lines for the period, the statement closing balance, the
//        GL/ledger balance of the bank's chart-of-accounts account, and the
//        computed difference between them.
// POST — two actions:
//        • complete   — rolls the included (categorized) lines into a
//                       reconciliation by stamping bankTransaction.reconciliationId
//                       and flips the reconciliation status to "completed".
//        • adjustment — posts a small write-off journal entry (DR/CR bank vs a
//                       configurable adjustment expense/income account) to clear
//                       a residual difference that can't be matched to a line.

const ADJUSTMENT_ACCOUNTS = {
  // Residual reconciliation differences. Income side when the bank shows more
  // than the books (we under-recorded), expense side when the bank shows less.
  income: {
    code: "4920",
    name: "Bank Reconciliation Adjustments (Income)",
    type: "revenue" as const,
    subType: "non_operating",
  },
  expense: {
    code: "5940",
    name: "Bank Reconciliation Adjustments (Expense)",
    type: "expense" as const,
    subType: "non_operating",
  },
};

/**
 * The GL/ledger balance of the bank account = the running balance of its
 * chart-of-accounts (asset) account from posted journal lines: sum(debit) -
 * sum(credit), in base-currency cents. Optionally bounded by `asOf` (inclusive)
 * to compare against a statement closing date.
 */
async function getGlBalance(
  organizationId: string,
  chartAccountId: string,
  asOf?: string
) {
  const conds = [
    eq(journalLine.accountId, chartAccountId),
    eq(journalEntry.organizationId, organizationId),
    eq(journalEntry.status, "posted"),
  ];
  if (asOf) conds.push(lte(journalEntry.date, asOf));

  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${journalLine.debitAmount} - ${journalLine.creditAmount}), 0)::int`,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(and(...conds));

  return row?.balance || 0;
}

async function loadAccount(id: string, organizationId: string) {
  return db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.id, id),
      eq(bankAccount.organizationId, organizationId),
      notDeleted(bankAccount.deletedAt)
    ),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const account = await loadAccount(id, ctx.organizationId);
    if (!account) return notFound("Bank account");

    const url = new URL(request.url);
    const recId = url.searchParams.get("reconciliationId");

    // Scope to a specific reconciliation if given, else the latest one (the one
    // the user is most likely working on). May be null if none exist yet.
    let rec: typeof bankReconciliation.$inferSelect | undefined;
    if (recId) {
      rec = await db.query.bankReconciliation.findFirst({
        where: and(
          eq(bankReconciliation.id, recId),
          eq(bankReconciliation.bankAccountId, id)
        ),
      });
      if (!rec) return notFound("Reconciliation");
    } else {
      rec = await db.query.bankReconciliation.findFirst({
        where: eq(bankReconciliation.bankAccountId, id),
        orderBy: desc(bankReconciliation.createdAt),
      });
    }

    // Reconciled lines: those already rolled into THIS reconciliation (if one is
    // in scope), otherwise any line carrying a reconciliationId.
    const reconciledWhere = rec
      ? eq(bankTransaction.reconciliationId, rec.id)
      : sql`${bankTransaction.reconciliationId} IS NOT NULL`;
    const reconciled = await db.query.bankTransaction.findMany({
      where: and(eq(bankTransaction.bankAccountId, id), reconciledWhere),
      orderBy: asc(bankTransaction.date),
    });

    // Unreconciled lines for the period: everything not yet rolled into a
    // completed reconciliation (reconciliationId IS NULL), excluding lines the
    // user has explicitly excluded. Bounded to the statement window when known.
    const unreconciledConds = [
      eq(bankTransaction.bankAccountId, id),
      isNull(bankTransaction.reconciliationId),
      sql`${bankTransaction.status} <> 'excluded'`,
    ];
    if (rec) {
      unreconciledConds.push(gte(bankTransaction.date, rec.startDate));
      unreconciledConds.push(lte(bankTransaction.date, rec.endDate));
    }
    const unreconciled = await db.query.bankTransaction.findMany({
      where: and(...unreconciledConds),
      orderBy: asc(bankTransaction.date),
    });

    // Statement closing balance: the period endBalance when a reconciliation is
    // in scope, otherwise the account's running balance.
    const statementEndBalance = rec ? rec.endBalance : account.balance;

    // GL/ledger balance of the bank's chart account, bounded to the statement
    // end date when known so it's comparable to the statement closing balance.
    const glBalance = account.chartAccountId
      ? await getGlBalance(
          ctx.organizationId,
          account.chartAccountId,
          rec?.endDate
        )
      : null;

    // Positive difference = statement shows more than the books (unrecorded
    // income / missing deposit); negative = books show more than the statement.
    const difference =
      glBalance === null ? null : statementEndBalance - glBalance;

    const sumAmount = (rows: typeof reconciled) =>
      rows.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({
      bankAccountId: id,
      reconciliation: rec ?? null,
      statementEndBalance,
      glBalance,
      difference,
      isBalanced: difference === 0,
      hasLedgerAccount: account.chartAccountId !== null,
      reconciled: {
        count: reconciled.length,
        total: sumAmount(reconciled),
        transactions: reconciled,
      },
      unreconciled: {
        count: unreconciled.length,
        total: sumAmount(unreconciled),
        transactions: unreconciled,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

const completeSchema = z.object({
  action: z.literal("complete"),
  reconciliationId: z.string().min(1),
  // Explicit lines to include; when omitted, all categorized lines in the
  // reconciliation window without an existing reconciliationId are included.
  transactionIds: z.array(z.string()).optional(),
});

const adjustmentSchema = z.object({
  action: z.literal("adjustment"),
  // Signed cents of the residual to clear: >0 = increase the bank's GL balance
  // (record extra income), <0 = decrease it (record an expense/loss). Usually
  // pass the GET `difference` directly.
  amount: z.number().int(),
  date: z.string().min(1),
  description: z.string().optional(),
  // Attach the resulting write-off line to this reconciliation (sets its
  // reconciliationId) so it shows on the completed statement.
  reconciliationId: z.string().optional(),
  // Override the adjustment chart account; otherwise a system income/expense
  // adjustment account is created/used via ensureAccountByCode.
  adjustmentAccountId: z.string().optional(),
});

const postSchema = z.discriminatedUnion("action", [
  completeSchema,
  adjustmentSchema,
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const account = await loadAccount(id, ctx.organizationId);
    if (!account) return notFound("Bank account");

    const body = await request.json();
    const parsed = postSchema.parse(body);

    if (parsed.action === "complete") {
      return completeReconciliation(ctx, id, parsed);
    }
    return postAdjustment(ctx, account, parsed);
  } catch (err) {
    return handleError(err);
  }
}

// --- complete: stamp reconciliationId on the included lines + close the rec ---
async function completeReconciliation(
  ctx: { organizationId: string; userId: string },
  bankAccountId: string,
  parsed: z.infer<typeof completeSchema>
) {
  const rec = await db.query.bankReconciliation.findFirst({
    where: and(
      eq(bankReconciliation.id, parsed.reconciliationId),
      eq(bankReconciliation.bankAccountId, bankAccountId)
    ),
  });
  if (!rec) return notFound("Reconciliation");
  if (rec.status === "completed") {
    return validationError("This reconciliation is already completed.");
  }

  // The lines to include: explicit ids (scoped to this account, categorized,
  // not already reconciled) or every categorized line in the period.
  const baseConds = [
    eq(bankTransaction.bankAccountId, bankAccountId),
    isNull(bankTransaction.reconciliationId),
    isNotNull(bankTransaction.journalEntryId),
  ];
  if (parsed.transactionIds && parsed.transactionIds.length > 0) {
    baseConds.push(inArray(bankTransaction.id, parsed.transactionIds));
  } else {
    baseConds.push(gte(bankTransaction.date, rec.startDate));
    baseConds.push(lte(bankTransaction.date, rec.endDate));
  }

  const lines = await db.query.bankTransaction.findMany({
    where: and(...baseConds),
    columns: { id: true },
  });

  const lineIds = lines.map((l) => l.id);

  await db.transaction(async (tx) => {
    if (lineIds.length > 0) {
      await tx
        .update(bankTransaction)
        .set({ reconciliationId: rec.id, status: "reconciled" })
        .where(inArray(bankTransaction.id, lineIds));
    }
    await tx
      .update(bankReconciliation)
      .set({ status: "completed" })
      .where(eq(bankReconciliation.id, rec.id));
  });

  await db.insert(auditLog).values({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "completed_reconciliation",
    entityType: "bank_reconciliation",
    entityId: rec.id,
    changes: { bankAccountId, transactionCount: lineIds.length },
  });

  return NextResponse.json({
    reconciliationId: rec.id,
    status: "completed",
    reconciledCount: lineIds.length,
  });
}

// --- adjustment: post a write-off entry to clear a residual difference ---
async function postAdjustment(
  ctx: { organizationId: string; userId: string },
  account: typeof bankAccount.$inferSelect,
  parsed: z.infer<typeof adjustmentSchema>
) {
  // Connect the bank account to its ledger account automatically (older accounts
  // self-heal on first use) so posting an adjustment never hits a dead end.
  const bankGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, account);
  if (parsed.amount === 0) {
    return validationError("Adjustment amount must be non-zero.");
  }

  const abs = Math.abs(parsed.amount);
  // amount > 0 → bank balance should go up → DR bank, CR income.
  // amount < 0 → bank balance should go down → CR bank, DR expense.
  const moneyIn = parsed.amount > 0;
  const description =
    parsed.description?.trim() || "Bank reconciliation adjustment";

  // Resolve the org base currency for the (system) adjustment account; the
  // adjustment is posted in base currency to match the GL balance it clears.
  const { base } = await resolveBaseRate(
    ctx.organizationId,
    account.currencyCode,
    parsed.date
  );

  // Resolve / verify the adjustment account.
  let adjustmentAccountId = parsed.adjustmentAccountId;
  if (adjustmentAccountId) {
    const found = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, adjustmentAccountId),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });
    if (!found) return notFound("Account");
  } else {
    const def = moneyIn
      ? ADJUSTMENT_ACCOUNTS.income
      : ADJUSTMENT_ACCOUNTS.expense;
    const acct = await ensureAccountByCode(ctx.organizationId, def, base);
    if (!acct) return validationError("Could not resolve an adjustment account.");
    adjustmentAccountId = acct.id;
  }

  const reference = "RECON-ADJ";

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
        sourceType: "bank_reconciliation_adjustment",
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    const lines: (typeof journalLine.$inferInsert)[] = [
      {
        journalEntryId: entry.id,
        accountId: bankGlAccountId,
        description,
        debitAmount: moneyIn ? abs : 0,
        creditAmount: moneyIn ? 0 : abs,
      },
      {
        journalEntryId: entry.id,
        accountId: adjustmentAccountId!,
        description,
        debitAmount: moneyIn ? 0 : abs,
        creditAmount: moneyIn ? abs : 0,
      },
    ];
    await tx.insert(journalLine).values(lines);

    return { entry };
  });

  // Optionally attach the write-off to a reconciliation so it appears on the
  // completed statement and offsets the residual difference.
  if (parsed.reconciliationId) {
    const rec = await db.query.bankReconciliation.findFirst({
      where: and(
        eq(bankReconciliation.id, parsed.reconciliationId),
        eq(bankReconciliation.bankAccountId, account.id)
      ),
    });
    if (rec) {
      await db.insert(bankTransaction).values({
        bankAccountId: account.id,
        date: parsed.date,
        description,
        reference,
        amount: parsed.amount,
        status: "reconciled",
        reconciliationId: rec.id,
        journalEntryId: entry.id,
        accountId: adjustmentAccountId,
        sourceType: "reconciliation_adjustment",
        currencyCode: base,
      });
    }
  }

  await db.insert(auditLog).values({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "posted_reconciliation_adjustment",
    entityType: "bank_account",
    entityId: account.id,
    changes: {
      journalEntryId: entry.id,
      amount: parsed.amount,
      adjustmentAccountId,
      reconciliationId: parsed.reconciliationId || null,
    },
  });

  return NextResponse.json(
    { journalEntryId: entry.id, adjustmentAccountId, amount: parsed.amount },
    { status: 201 }
  );
}
