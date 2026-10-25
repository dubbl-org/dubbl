import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenseClaim, journalEntry, journalLine, organization } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Server-side first page of expense claims, mirroring GET /api/v1/expenses with
 * the default filters. Used for the first paint; the client keeps using the API
 * for filtering, paging and mutations.
 */
export async function listExpenseClaims(organizationId: string, limit = 50) {
  const conditions = [
    eq(expenseClaim.organizationId, organizationId),
    notDeleted(expenseClaim.deletedAt),
  ];

  const claims = await db.query.expenseClaim.findMany({
    where: and(...conditions),
    orderBy: desc(expenseClaim.createdAt),
    limit,
    with: { submittedByUser: true },
  });

  const [count] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(expenseClaim)
    .where(and(...conditions));

  return { claims, total: Number(count?.count ?? 0) };
}

export interface ExpenseStatusCount {
  count: number;
  /** Native claim amounts, per currency. Never added together. */
  amounts: { currency: string; amount: number }[];
}

export interface ExpenseCounts {
  counts: Record<string, ExpenseStatusCount>;
  total: number;
  /** Base-currency value of claims that reached the ledger, read back from it. */
  booked: { currency: string; amount: number };
}

/**
 * Status counts and money for the expenses header — also served by
 * GET /api/v1/expenses/counts.
 *
 * A claim is a document until it posts: its amount is a memo in whatever
 * currency it was submitted, so it is reported per currency and never summed
 * across currencies. After posting, the claim's journal entry holds the value
 * in the books' currency, and only that figure is an accounting one.
 */
export async function expenseStatusCounts(
  organizationId: string
): Promise<ExpenseCounts> {
  const [rows, [bookedRow], org] = await Promise.all([
    db
      .select({
        status: expenseClaim.status,
        currency: expenseClaim.currencyCode,
        count: sql<number>`count(*)`.mapWith(Number),
        amount: sql<number>`coalesce(sum(${expenseClaim.totalAmount}), 0)`.mapWith(Number),
      })
      .from(expenseClaim)
      .where(
        and(
          eq(expenseClaim.organizationId, organizationId),
          notDeleted(expenseClaim.deletedAt)
        )
      )
      .groupBy(expenseClaim.status, expenseClaim.currencyCode),
    // Posted claims only, at the base-currency amount their entry was booked at,
    // so a duplicate posting or an undone test entry cannot inflate the total.
    db
      .select({
        amount: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`.mapWith(Number),
      })
      .from(expenseClaim)
      .innerJoin(
        journalEntry,
        and(
          eq(journalEntry.id, expenseClaim.journalEntryId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt)
        )
      )
      .innerJoin(journalLine, eq(journalLine.journalEntryId, journalEntry.id))
      .where(
        and(
          eq(expenseClaim.organizationId, organizationId),
          notDeleted(expenseClaim.deletedAt)
        )
      ),
    db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { defaultCurrency: true },
    }),
  ]);

  const counts: Record<string, ExpenseStatusCount> = {};
  let total = 0;
  for (const row of rows) {
    const entry = (counts[row.status] ??= { count: 0, amounts: [] });
    entry.count += row.count;
    entry.amounts.push({ currency: row.currency, amount: row.amount });
    total += row.count;
  }
  for (const entry of Object.values(counts)) {
    entry.amounts.sort((a, b) => a.currency.localeCompare(b.currency));
  }

  return {
    counts,
    total,
    booked: {
      currency: org?.defaultCurrency ?? "USD",
      amount: bookedRow?.amount ?? 0,
    },
  };
}
