import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice, payment } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Server-side data for the invoices list, mirroring GET /api/v1/invoices with
 * default filters plus /api/v1/invoices/summary and the recent-payments strip.
 * The client keeps using the API for filtering, paging and mutations.
 */
export async function listInvoices(organizationId: string, limit = 50) {
  const conditions = [
    eq(invoice.organizationId, organizationId),
    notDeleted(invoice.deletedAt),
  ];

  const rows = await db.query.invoice.findMany({
    where: and(...conditions),
    orderBy: desc(invoice.createdAt),
    limit,
    with: { contact: true, lines: true },
  });

  const [count] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(invoice)
    .where(and(...conditions));

  return { invoices: rows, total: Number(count?.count ?? 0) };
}

export async function invoiceSummary(organizationId: string) {
  const rows = await db
    .select({
      status: invoice.status,
      count: sql<number>`count(*)`.mapWith(Number),
      outstanding: sql<number>`coalesce(sum(${invoice.amountDue}), 0)`.mapWith(Number),
    })
    .from(invoice)
    .where(
      and(eq(invoice.organizationId, organizationId), notDeleted(invoice.deletedAt))
    )
    .groupBy(invoice.status);

  let totalCount = 0;
  let outstanding = 0;
  for (const row of rows) {
    totalCount += row.count;
    if (row.status !== "paid" && row.status !== "void") outstanding += row.outstanding;
  }
  return { totalCount, outstanding, overdue: 0, aging: {} as Record<string, { count: number; amount: number }> };
}

export async function recentReceivedPayments(organizationId: string, limit = 5) {
  return db.query.payment.findMany({
    where: and(
      eq(payment.organizationId, organizationId),
      eq(payment.type, "received"),
      notDeleted(payment.deletedAt)
    ),
    orderBy: desc(payment.date),
    limit,
  });
}
