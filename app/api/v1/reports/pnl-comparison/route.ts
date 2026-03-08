import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

interface PeriodResult {
  label: string;
  startDate: string;
  endDate: string;
  revenue: { accountId: string; accountName: string; balance: number }[];
  expenses: { accountId: string; accountName: string; balance: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

async function getPnlForPeriod(
  organizationId: string,
  startDate: string,
  endDate: string
) {
  const entries = await db
    .select({
      accountId: journalLine.accountId,
      accountName: chartAccount.name,
      accountType: chartAccount.type,
      debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`,
      credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`,
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt),
        gte(journalEntry.date, startDate),
        lte(journalEntry.date, endDate)
      )
    )
    .groupBy(journalLine.accountId, chartAccount.name, chartAccount.type);

  const revenue: { accountId: string; accountName: string; balance: number }[] = [];
  const expenses: { accountId: string; accountName: string; balance: number }[] = [];

  for (const row of entries) {
    const debit = Number(row.debit);
    const credit = Number(row.credit);

    if (row.accountType === "revenue") {
      revenue.push({
        accountId: row.accountId,
        accountName: row.accountName,
        balance: credit - debit,
      });
    } else if (row.accountType === "expense") {
      expenses.push({
        accountId: row.accountId,
        accountName: row.accountName,
        balance: debit - credit,
      });
    }
  }

  const totalRevenue = revenue.reduce((sum, r) => sum + r.balance, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.balance, 0);

  return { revenue, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
}

function getMonthLabel(year: number, month: number) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[month]} ${year}`;
}

function getQuarterLabel(year: number, quarter: number) {
  return `Q${quarter} ${year}`;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);

    // Compare type: "monthly", "quarterly", "yearly"
    const compareType = url.searchParams.get("compare") || "monthly";
    // Number of periods to compare (default 6 for monthly, 4 for quarterly, 3 for yearly)
    const defaultPeriods = compareType === "monthly" ? 6 : compareType === "quarterly" ? 4 : 3;
    const periods = Math.min(parseInt(url.searchParams.get("periods") || String(defaultPeriods)), 12);

    const now = new Date();
    const results: PeriodResult[] = [];

    for (let i = periods - 1; i >= 0; i--) {
      let startDate: string;
      let endDate: string;
      let label: string;

      if (compareType === "monthly") {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        startDate = d.toISOString().slice(0, 10);
        endDate = lastDay.toISOString().slice(0, 10);
        label = getMonthLabel(d.getFullYear(), d.getMonth());
      } else if (compareType === "quarterly") {
        const currentQ = Math.floor(now.getMonth() / 3);
        const targetQ = currentQ - i;
        const year = now.getFullYear() + Math.floor(targetQ / 4);
        const q = ((targetQ % 4) + 4) % 4;
        const startMonth = q * 3;
        const d = new Date(year, startMonth, 1);
        const lastDay = new Date(year, startMonth + 3, 0);
        startDate = d.toISOString().slice(0, 10);
        endDate = lastDay.toISOString().slice(0, 10);
        label = getQuarterLabel(year, q + 1);
      } else {
        // yearly
        const year = now.getFullYear() - i;
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        label = String(year);
      }

      const pnl = await getPnlForPeriod(ctx.organizationId, startDate, endDate);
      results.push({ label, startDate, endDate, ...pnl });
    }

    // Calculate changes between consecutive periods
    const periodsWithChanges = results.map((p, idx) => {
      const prev = idx > 0 ? results[idx - 1] : null;
      return {
        ...p,
        revenueChange: prev ? p.totalRevenue - prev.totalRevenue : 0,
        revenueChangePct: prev && prev.totalRevenue !== 0
          ? Math.round(((p.totalRevenue - prev.totalRevenue) / Math.abs(prev.totalRevenue)) * 10000) / 100
          : 0,
        expensesChange: prev ? p.totalExpenses - prev.totalExpenses : 0,
        expensesChangePct: prev && prev.totalExpenses !== 0
          ? Math.round(((p.totalExpenses - prev.totalExpenses) / Math.abs(prev.totalExpenses)) * 10000) / 100
          : 0,
        netIncomeChange: prev ? p.netIncome - prev.netIncome : 0,
        netIncomeChangePct: prev && prev.netIncome !== 0
          ? Math.round(((p.netIncome - prev.netIncome) / Math.abs(prev.netIncome)) * 10000) / 100
          : 0,
      };
    });

    return NextResponse.json({
      compareType,
      periods: periodsWithChanges,
    });
  } catch (err) {
    return handleError(err);
  }
}
