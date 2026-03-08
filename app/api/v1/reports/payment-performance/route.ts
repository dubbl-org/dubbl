import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill, contact } from "@/lib/db/schema";
import { eq, and, gte, lte, isNotNull, isNull, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate =
      url.searchParams.get("startDate") ||
      `${new Date().getFullYear()}-01-01`;
    const endDate =
      url.searchParams.get("endDate") ||
      new Date().toISOString().slice(0, 10);

    // Paid invoices with payment timing
    const paidInvoices = await db
      .select({
        contactId: invoice.contactId,
        contactName: contact.name,
        avgDaysToCollect: sql<number>`AVG(${invoice.paidAt}::date - ${invoice.issueDate}::date)`,
        avgTermDays: sql<number>`AVG(${invoice.dueDate}::date - ${invoice.issueDate}::date)`,
        invoiceCount: sql<number>`COUNT(*)`,
        totalCollected: sql<number>`COALESCE(SUM(${invoice.total}), 0)`,
        lateCount: sql<number>`SUM(CASE WHEN ${invoice.paidAt}::date > ${invoice.dueDate}::date THEN 1 ELSE 0 END)`,
      })
      .from(invoice)
      .innerJoin(contact, eq(invoice.contactId, contact.id))
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          eq(invoice.status, "paid"),
          isNotNull(invoice.paidAt),
          isNull(invoice.deletedAt),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate)
        )
      )
      .groupBy(invoice.contactId, contact.name)
      .orderBy(sql`avg_days_to_collect DESC`);

    // Paid bills with payment timing
    const paidBills = await db
      .select({
        contactId: bill.contactId,
        contactName: contact.name,
        avgDaysToPay: sql<number>`AVG(${bill.paidAt}::date - ${bill.issueDate}::date)`,
        avgTermDays: sql<number>`AVG(${bill.dueDate}::date - ${bill.issueDate}::date)`,
        billCount: sql<number>`COUNT(*)`,
        totalPaid: sql<number>`COALESCE(SUM(${bill.total}), 0)`,
        lateCount: sql<number>`SUM(CASE WHEN ${bill.paidAt}::date > ${bill.dueDate}::date THEN 1 ELSE 0 END)`,
      })
      .from(bill)
      .innerJoin(contact, eq(bill.contactId, contact.id))
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          eq(bill.status, "paid"),
          isNotNull(bill.paidAt),
          isNull(bill.deletedAt),
          gte(bill.issueDate, startDate),
          lte(bill.issueDate, endDate)
        )
      )
      .groupBy(bill.contactId, contact.name)
      .orderBy(sql`avg_days_to_pay DESC`);

    const receivables = paidInvoices.map((r) => ({
      contactId: r.contactId,
      contactName: r.contactName,
      avgDays: Math.round(Number(r.avgDaysToCollect) || 0),
      avgTermDays: Math.round(Number(r.avgTermDays) || 0),
      invoiceCount: Number(r.invoiceCount),
      totalCollected: Number(r.totalCollected),
      lateCount: Number(r.lateCount || 0),
      onTimeRate:
        Number(r.invoiceCount) > 0
          ? Math.round(
              ((Number(r.invoiceCount) - Number(r.lateCount || 0)) /
                Number(r.invoiceCount)) *
                100
            )
          : 100,
    }));

    const payables = paidBills.map((r) => ({
      contactId: r.contactId,
      contactName: r.contactName,
      avgDays: Math.round(Number(r.avgDaysToPay) || 0),
      avgTermDays: Math.round(Number(r.avgTermDays) || 0),
      billCount: Number(r.billCount),
      totalPaid: Number(r.totalPaid),
      lateCount: Number(r.lateCount || 0),
      onTimeRate:
        Number(r.billCount) > 0
          ? Math.round(
              ((Number(r.billCount) - Number(r.lateCount || 0)) /
                Number(r.billCount)) *
                100
            )
          : 100,
    }));

    const avgDaysToCollect =
      receivables.length > 0
        ? Math.round(
            receivables.reduce((s, r) => s + r.avgDays * r.invoiceCount, 0) /
              receivables.reduce((s, r) => s + r.invoiceCount, 0)
          )
        : 0;
    const avgDaysToPay =
      payables.length > 0
        ? Math.round(
            payables.reduce((s, r) => s + r.avgDays * r.billCount, 0) /
              payables.reduce((s, r) => s + r.billCount, 0)
          )
        : 0;

    return NextResponse.json({
      startDate,
      endDate,
      avgDaysToCollect,
      avgDaysToPay,
      receivables,
      payables,
    });
  } catch (err) {
    return handleError(err);
  }
}
