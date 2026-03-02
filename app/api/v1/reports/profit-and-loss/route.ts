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
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);

    // Get all posted journal entries within date range
    const entries = await db
      .select({
        accountId: journalLine.accountId,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        accountType: chartAccount.type,
        debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
        credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
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
          lte(journalEntry.date, endDate)
        )
      )
      .groupBy(
        journalLine.accountId,
        chartAccount.name,
        chartAccount.code,
        chartAccount.type
      );

    const revenue: { accountId: string; accountName: string; accountCode: string; balance: number }[] = [];
    const expenses: { accountId: string; accountName: string; accountCode: string; balance: number }[] = [];

    for (const row of entries) {
      const debit = Number(row.debit);
      const credit = Number(row.credit);

      if (row.accountType === "revenue") {
        // Revenue: credit - debit (revenue is normally credit balance)
        revenue.push({
          accountId: row.accountId,
          accountName: row.accountName,
          accountCode: row.accountCode,
          balance: credit - debit,
        });
      } else if (row.accountType === "expense") {
        // Expense: debit - credit (expense is normally debit balance)
        expenses.push({
          accountId: row.accountId,
          accountName: row.accountName,
          accountCode: row.accountCode,
          balance: debit - credit,
        });
      }
    }

    const totalRevenue = revenue.reduce((sum, r) => sum + r.balance, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.balance, 0);
    const netIncome = totalRevenue - totalExpenses;

    return NextResponse.json({
      startDate,
      endDate,
      revenue,
      totalRevenue,
      expenses,
      totalExpenses,
      netIncome,
    });
  } catch (err) {
    return handleError(err);
  }
}
