import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  customerCredit,
  bankAccount,
  chartAccount,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { checkMultiCurrency } from "@/lib/api/check-limit";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { currencyCodeSchema } from "@/lib/currency/zod";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
  ensureControlAccount,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { z } from "zod";

// A customer credit holds money received in advance of (or in excess of) an
// invoice: a prepayment, a refundable deposit, or an overpayment on account.
// Creating one posts cash immediately and books a Customer Deposits liability.
const createSchema = z.object({
  contactId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number().int().positive().describe("Credit amount in integer cents."),
  sourceType: z.enum(["prepayment", "overpayment", "credit_note"]),
  currencyCode: currencyCodeSchema.optional(),
  notes: z.string().nullable().optional(),
  // Where the cash landed: a bank account (preferred) or a deposit chart
  // account. Exactly one is used to post DR cash. Optional only for the
  // 'credit_note' source, whose cash/AR side is posted elsewhere.
  bankAccountId: z.string().nullable().optional(),
  depositAccountId: z.string().nullable().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  date: customerCredit.date,
  amount: customerCredit.originalAmount,
  remaining: customerCredit.amountRemaining,
  created: customerCredit.createdAt,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const contactId = url.searchParams.get("contactId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(customerCredit.organizationId, ctx.organizationId),
      notDeleted(customerCredit.deletedAt),
    ];

    if (status) {
      conditions.push(
        eq(customerCredit.status, status as (typeof customerCredit.status.enumValues)[number])
      );
    }
    if (contactId) {
      conditions.push(eq(customerCredit.contactId, contactId));
    }
    if (from) {
      conditions.push(gte(customerCredit.date, from));
    }
    if (to) {
      conditions.push(lte(customerCredit.date, to));
    }

    const sortCol = SORT_COLUMNS[sortBy] || customerCredit.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const credits = await db.query.customerCredit.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(customerCredit)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(credits, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.date);

    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      parsed.contactId
    );
    await checkMultiCurrency(ctx.organizationId, currencyCode);

    // Resolve the cash account: bank account's linked GL > deposit chart account.
    let cashAccountId: string | null = null;
    if (parsed.bankAccountId) {
      const acct = await db.query.bankAccount.findFirst({
        where: and(
          eq(bankAccount.id, parsed.bankAccountId),
          eq(bankAccount.organizationId, ctx.organizationId),
          notDeleted(bankAccount.deletedAt)
        ),
        columns: {
          id: true,
          accountName: true,
          accountType: true,
          currencyCode: true,
          chartAccountId: true,
        },
      });
      if (!acct) return notFound("Bank account");
      // Connect the bank account to its ledger account automatically (older
      // accounts self-heal on first use) so recording a credit never dead-ends.
      cashAccountId = await ensureBankLedgerAccount(ctx.organizationId, acct);
    } else if (parsed.depositAccountId) {
      const acct = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.id, parsed.depositAccountId),
          eq(chartAccount.organizationId, ctx.organizationId)
        ),
        columns: { id: true },
      });
      if (!acct) return notFound("Deposit account");
      cashAccountId = acct.id;
    } else {
      return validationError(
        "A bankAccountId or depositAccountId is required to record where the money landed."
      );
    }

    // Foreign-currency credits need a base rate to post. Pre-flight first.
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, parsed.date);

    const { currency, rate, base } = await resolveBaseRate(
      ctx.organizationId,
      currencyCode,
      parsed.date
    );

    const created = await db.transaction(async (tx) => {
      // Customer Deposits (2410) liability — money owed back / yet to be earned.
      const deposits = await ensureControlAccount(
        ctx.organizationId,
        "customerDeposits",
        base,
        tx
      );
      if (!deposits) {
        throw new Error("Could not resolve the Customer Deposits account");
      }

      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const description = `Customer ${parsed.sourceType} received`;
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: parsed.date,
          description,
          reference: parsed.sourceType,
          status: "posted",
          sourceType: "customer_credit",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      // DR Cash / CR Customer Deposits (in document currency, then to base).
      const lines: (typeof journalLine.$inferInsert)[] = [
        {
          journalEntryId: entry.id,
          accountId: cashAccountId!,
          description,
          debitAmount: parsed.amount,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: deposits.id,
          description,
          debitAmount: 0,
          creditAmount: parsed.amount,
        },
      ];
      await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

      const [row] = await tx
        .insert(customerCredit)
        .values({
          organizationId: ctx.organizationId,
          contactId: parsed.contactId,
          date: parsed.date,
          currencyCode,
          originalAmount: parsed.amount,
          amountRemaining: parsed.amount,
          sourceType: parsed.sourceType,
          status: "open",
          journalEntryId: entry.id,
          notes: parsed.notes || null,
          createdBy: ctx.userId,
        })
        .returning();

      return row;
    });

    logAudit({
      ctx,
      action: "create",
      entityType: "customer_credit",
      entityId: created.id,
      request,
    });

    return NextResponse.json({ customerCredit: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
