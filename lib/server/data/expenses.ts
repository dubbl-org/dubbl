import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenseClaim } from "@/lib/db/schema";
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

/** Status counts for the tab badges — mirrors GET /api/v1/expenses/counts. */
export async function expenseStatusCounts(organizationId: string) {
  const rows = await db
    .select({
      status: expenseClaim.status,
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
    .groupBy(expenseClaim.status);

  const counts: Record<string, { count: number; amount: number }> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.status] = { count: row.count, amount: row.amount };
    total += row.count;
  }
  return { counts, total };
}
