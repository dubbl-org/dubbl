import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Server-side bills data, mirroring GET /api/v1/bills (default filters and the
 * 200-row overview query) plus /api/v1/bills/counts.
 */
export async function listBills(organizationId: string, limit = 50) {
  const conditions = [
    eq(bill.organizationId, organizationId),
    notDeleted(bill.deletedAt),
  ];

  const rows = await db.query.bill.findMany({
    where: and(...conditions),
    orderBy: desc(bill.createdAt),
    limit,
    with: { contact: true },
  });

  const [count] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(bill)
    .where(and(...conditions));

  return { bills: rows, total: Number(count?.count ?? 0) };
}

/** First 200 bills for the overview cards, matching the client's own query. */
export async function listBillsForOverview(organizationId: string) {
  return db.query.bill.findMany({
    where: and(
      eq(bill.organizationId, organizationId),
      notDeleted(bill.deletedAt)
    ),
    orderBy: desc(bill.createdAt),
    limit: 200,
    with: { contact: true },
  });
}

export async function billStatusCounts(organizationId: string) {
  const rows = await db
    .select({
      status: bill.status,
      count: sql<number>`count(*)`.mapWith(Number),
      amount: sql<number>`coalesce(sum(${bill.total}), 0)`.mapWith(Number),
    })
    .from(bill)
    .where(
      and(eq(bill.organizationId, organizationId), notDeleted(bill.deletedAt))
    )
    .groupBy(bill.status);

  const counts: Record<string, { count: number; amount: number }> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.status] = { count: row.count, amount: row.amount };
    total += row.count;
  }
  return { counts, total };
}
