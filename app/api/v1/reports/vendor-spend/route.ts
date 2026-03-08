import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill, contact } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, notInArray, isNull } from "drizzle-orm";
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

    // Total spend per vendor
    const vendors = await db
      .select({
        contactId: bill.contactId,
        contactName: contact.name,
        totalSpend: sql<number>`COALESCE(SUM(${bill.total}), 0)`,
        billCount: sql<number>`COUNT(*)`,
        avgBillAmount: sql<number>`COALESCE(AVG(${bill.total}), 0)`,
        lastBillDate: sql<string>`MAX(${bill.issueDate})`,
      })
      .from(bill)
      .innerJoin(contact, eq(bill.contactId, contact.id))
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notInArray(bill.status, ["draft", "void"]),
          isNull(bill.deletedAt),
          gte(bill.issueDate, startDate),
          lte(bill.issueDate, endDate)
        )
      )
      .groupBy(bill.contactId, contact.name)
      .orderBy(sql`total_spend DESC`);

    const totalSpend = vendors.reduce((s, v) => s + Number(v.totalSpend), 0);

    const entries = vendors.map((v) => ({
      contactId: v.contactId,
      contactName: v.contactName,
      totalSpend: Number(v.totalSpend),
      billCount: Number(v.billCount),
      avgBillAmount: Math.round(Number(v.avgBillAmount)),
      lastBillDate: v.lastBillDate,
      percentage:
        totalSpend > 0
          ? Math.round((Number(v.totalSpend) / totalSpend) * 10000) / 100
          : 0,
    }));

    // Monthly trend for top 5 vendors
    const top5Ids = entries.slice(0, 5).map((e) => e.contactId);
    let monthlyTrend: { contactId: string; month: string; total: number }[] = [];

    if (top5Ids.length > 0) {
      const trendRows = await db
        .select({
          contactId: bill.contactId,
          month: sql<string>`TO_CHAR(${bill.issueDate}::date, 'YYYY-MM')`.as("month"),
          total: sql<number>`COALESCE(SUM(${bill.total}), 0)`,
        })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            notInArray(bill.status, ["draft", "void"]),
            isNull(bill.deletedAt),
            gte(bill.issueDate, startDate),
            lte(bill.issueDate, endDate),
            sql`${bill.contactId} = ANY(${top5Ids})`
          )
        )
        .groupBy(bill.contactId, sql`TO_CHAR(${bill.issueDate}::date, 'YYYY-MM')`)
        .orderBy(sql`month`);

      monthlyTrend = trendRows.map((r) => ({
        contactId: r.contactId,
        month: r.month,
        total: Number(r.total),
      }));
    }

    return NextResponse.json({
      startDate,
      endDate,
      totalSpend,
      vendorCount: entries.length,
      vendors: entries,
      monthlyTrend,
    });
  } catch (err) {
    return handleError(err);
  }
}
