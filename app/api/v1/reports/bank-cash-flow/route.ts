import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and, gte, lte, ne, sql, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);

    const bankAccountId = url.searchParams.get("bankAccountId");
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const groupBy = url.searchParams.get("groupBy") || "month";

    // Build the date truncation expression based on groupBy
    let dateTrunc: string;
    switch (groupBy) {
      case "day":
        dateTrunc = "day";
        break;
      case "week":
        dateTrunc = "week";
        break;
      case "month":
      default:
        dateTrunc = "month";
        break;
    }

    // Get valid bank account IDs for this org
    const orgAccounts = await db
      .select({ id: bankAccount.id })
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.organizationId, ctx.organizationId),
          notDeleted(bankAccount.deletedAt)
        )
      );

    const orgAccountIds = orgAccounts.map((a) => a.id);

    if (orgAccountIds.length === 0) {
      return NextResponse.json({
        periods: [],
        totals: { inflows: 0, outflows: 0, net: 0 },
      });
    }

    // Build conditions
    const conditions = [
      bankAccountId
        ? eq(bankTransaction.bankAccountId, bankAccountId)
        : sql`${bankTransaction.bankAccountId} = ANY(${orgAccountIds})`,
      ne(bankTransaction.status, "excluded"),
      gte(bankTransaction.date, startDate),
      lte(bankTransaction.date, endDate),
    ];

    // Query grouped by period
    const rows = await db
      .select({
        periodStart: sql<string>`DATE_TRUNC('${sql.raw(dateTrunc)}', ${bankTransaction.date}::date)::date`.as("period_start"),
        inflows: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransaction.amount} > 0 THEN ${bankTransaction.amount} ELSE 0 END), 0)`.as("inflows"),
        outflows: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransaction.amount} < 0 THEN ${bankTransaction.amount} ELSE 0 END), 0)`.as("outflows"),
        net: sql<number>`COALESCE(SUM(${bankTransaction.amount}), 0)`.as("net"),
      })
      .from(bankTransaction)
      .where(and(...conditions))
      .groupBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${bankTransaction.date}::date)::date`)
      .orderBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${bankTransaction.date}::date)::date`);

    // Calculate running balance and format periods
    let runningBalance = 0;
    let totalInflows = 0;
    let totalOutflows = 0;
    let totalNet = 0;

    const periods = rows.map((row) => {
      const inflows = Number(row.inflows);
      const outflows = Number(row.outflows);
      const net = Number(row.net);

      runningBalance += net;
      totalInflows += inflows;
      totalOutflows += outflows;
      totalNet += net;

      const periodDate = new Date(row.periodStart);
      let label: string;
      let periodEndDate: string;

      if (groupBy === "day") {
        label = periodDate.toISOString().slice(0, 10);
        periodEndDate = label;
      } else if (groupBy === "week") {
        const weekEnd = new Date(periodDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        label = `${periodDate.toISOString().slice(0, 10)} - ${weekEnd.toISOString().slice(0, 10)}`;
        periodEndDate = weekEnd.toISOString().slice(0, 10);
      } else {
        label = periodDate.toLocaleDateString("en-US", { year: "numeric", month: "short" });
        const monthEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);
        periodEndDate = monthEnd.toISOString().slice(0, 10);
      }

      return {
        label,
        startDate: periodDate.toISOString().slice(0, 10),
        endDate: periodEndDate,
        inflows,
        outflows,
        net,
        balance: runningBalance,
      };
    });

    return NextResponse.json({
      periods,
      totals: {
        inflows: totalInflows,
        outflows: totalOutflows,
        net: totalNet,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
