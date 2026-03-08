import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, sql } from "drizzle-orm";
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

    // Expenses by account (category)
    const byCategory = await db
      .select({
        accountId: journalLine.accountId,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        subType: chartAccount.subType,
        total: sql<number>`COALESCE(SUM(${journalLine.debitAmount}) - SUM(${journalLine.creditAmount}), 0)`,
        txCount: sql<number>`COUNT(DISTINCT ${journalEntry.id})`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          eq(chartAccount.type, "expense"),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate)
        )
      )
      .groupBy(
        journalLine.accountId,
        chartAccount.name,
        chartAccount.code,
        chartAccount.subType
      )
      .orderBy(sql`total DESC`);

    // Monthly trend
    const monthlyTrend = await db
      .select({
        month: sql<string>`TO_CHAR(${journalEntry.date}::date, 'YYYY-MM')`.as("month"),
        total: sql<number>`COALESCE(SUM(${journalLine.debitAmount}) - SUM(${journalLine.creditAmount}), 0)`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          eq(chartAccount.type, "expense"),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate)
        )
      )
      .groupBy(sql`TO_CHAR(${journalEntry.date}::date, 'YYYY-MM')`)
      .orderBy(sql`month`);

    const totalExpenses = byCategory.reduce((s, c) => s + Number(c.total), 0);
    const monthlyAvg =
      monthlyTrend.length > 0
        ? Math.round(totalExpenses / monthlyTrend.length)
        : 0;

    // Top categories with percentage
    const categories = byCategory.map((c) => ({
      accountId: c.accountId,
      accountName: c.accountName,
      accountCode: c.accountCode,
      subType: c.subType,
      total: Number(c.total),
      transactions: Number(c.txCount),
      percentage:
        totalExpenses > 0
          ? Math.round((Number(c.total) / totalExpenses) * 10000) / 100
          : 0,
    }));

    return NextResponse.json({
      startDate,
      endDate,
      totalExpenses,
      monthlyAverage: monthlyAvg,
      categories,
      monthlyTrend: monthlyTrend.map((m) => ({
        month: m.month,
        total: Number(m.total),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
