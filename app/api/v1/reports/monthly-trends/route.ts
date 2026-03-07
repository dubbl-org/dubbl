import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const months = Math.min(parseInt(url.searchParams.get("months") || "6"), 24);

    // Go back N months from today
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startDate = startMonth.toISOString().slice(0, 10);

    const rows = await db
      .select({
        month: sql<string>`TO_CHAR(${journalEntry.date}::date, 'YYYY-MM')`.as("month"),
        type: chartAccount.type,
        debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`,
        credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          gte(journalEntry.date, startDate),
          sql`${chartAccount.type} IN ('revenue', 'expense')`
        )
      )
      .groupBy(
        sql`TO_CHAR(${journalEntry.date}::date, 'YYYY-MM')`,
        chartAccount.type
      )
      .orderBy(sql`month`);

    // Build month-by-month data
    const monthMap = new Map<string, { revenue: number; expenses: number }>();

    // Initialize all months
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = d.toISOString().slice(0, 7);
      monthMap.set(key, { revenue: 0, expenses: 0 });
    }

    for (const row of rows) {
      const existing = monthMap.get(row.month);
      if (!existing) continue;
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      if (row.type === "revenue") existing.revenue += credit - debit;
      else if (row.type === "expense") existing.expenses += debit - credit;
    }

    const trend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        netIncome: data.revenue - data.expenses,
      }));

    return NextResponse.json({
      months: trend,
      revenueSparkline: trend.map((t) => t.revenue),
      expenseSparkline: trend.map((t) => t.expenses),
      netIncomeSparkline: trend.map((t) => t.netIncome),
    });
  } catch (err) {
    return handleError(err);
  }
}
