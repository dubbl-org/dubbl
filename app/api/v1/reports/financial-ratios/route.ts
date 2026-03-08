import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  chartAccount,
  journalLine,
  journalEntry,
  invoice,
  bill,
} from "@/lib/db/schema";
import { eq, and, sql, isNull, gte, lte, notInArray } from "drizzle-orm";
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

    // Get all account balances
    const accounts = await db
      .select({
        type: chartAccount.type,
        subType: chartAccount.subType,
        debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`,
        credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`,
      })
      .from(chartAccount)
      .leftJoin(journalLine, eq(journalLine.accountId, chartAccount.id))
      .leftJoin(
        journalEntry,
        and(
          eq(journalLine.journalEntryId, journalEntry.id),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt)
        )
      )
      .where(eq(chartAccount.organizationId, ctx.organizationId))
      .groupBy(chartAccount.type, chartAccount.subType);

    // Revenue/expense for the period
    const pnlData = await db
      .select({
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
          lte(journalEntry.date, endDate)
        )
      )
      .groupBy(chartAccount.type);

    // Calculate balances by type
    let totalAssets = 0;
    let currentAssets = 0;
    let totalLiabilities = 0;
    let currentLiabilities = 0;
    let totalEquity = 0;
    let inventory = 0;

    for (const a of accounts) {
      const debit = Number(a.debit);
      const credit = Number(a.credit);
      const sub = (a.subType || "").toLowerCase();

      if (a.type === "asset") {
        const balance = debit - credit;
        totalAssets += balance;
        // Current assets: not fixed/property/equipment
        if (
          !sub.includes("fixed") &&
          !sub.includes("property") &&
          !sub.includes("equipment") &&
          !sub.includes("intangible")
        ) {
          currentAssets += balance;
        }
        if (sub.includes("inventory")) {
          inventory += balance;
        }
      } else if (a.type === "liability") {
        const balance = credit - debit;
        totalLiabilities += balance;
        // Current liabilities: not long-term
        if (!sub.includes("long") && !sub.includes("mortgage")) {
          currentLiabilities += balance;
        }
      } else if (a.type === "equity") {
        totalEquity += credit - debit;
      }
    }

    // P&L for the period
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const row of pnlData) {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      if (row.type === "revenue") totalRevenue += credit - debit;
      else if (row.type === "expense") totalExpenses += debit - credit;
    }

    const netIncome = totalRevenue - totalExpenses;

    // Outstanding receivables
    const [arResult] = await db
      .select({
        totalDue: sql<number>`COALESCE(SUM(${invoice.amountDue}), 0)`,
      })
      .from(invoice)
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          notInArray(invoice.status, ["draft", "void", "paid"])
        )
      );

    // Outstanding payables
    const [apResult] = await db
      .select({
        totalDue: sql<number>`COALESCE(SUM(${bill.amountDue}), 0)`,
      })
      .from(bill)
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notInArray(bill.status, ["draft", "void", "paid"])
        )
      );

    const receivablesDue = Number(arResult?.totalDue || 0);
    const payablesDue = Number(apResult?.totalDue || 0);

    // Calculate days in period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysInPeriod = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Ratios
    const currentRatio =
      currentLiabilities !== 0
        ? Math.round((currentAssets / currentLiabilities) * 100) / 100
        : null;
    const quickRatio =
      currentLiabilities !== 0
        ? Math.round(((currentAssets - inventory) / currentLiabilities) * 100) / 100
        : null;
    const debtToEquity =
      totalEquity !== 0
        ? Math.round((totalLiabilities / totalEquity) * 100) / 100
        : null;
    const grossMargin =
      totalRevenue !== 0
        ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 10000) / 100
        : null;
    const netMargin =
      totalRevenue !== 0
        ? Math.round((netIncome / totalRevenue) * 10000) / 100
        : null;
    // DSO: (receivables / revenue) * days
    const dso =
      totalRevenue !== 0
        ? Math.round((receivablesDue / totalRevenue) * daysInPeriod)
        : null;
    // DPO: (payables / expenses) * days
    const dpo =
      totalExpenses !== 0
        ? Math.round((payablesDue / totalExpenses) * daysInPeriod)
        : null;
    const returnOnAssets =
      totalAssets !== 0
        ? Math.round((netIncome / totalAssets) * 10000) / 100
        : null;
    const returnOnEquity =
      totalEquity !== 0
        ? Math.round((netIncome / totalEquity) * 10000) / 100
        : null;

    return NextResponse.json({
      startDate,
      endDate,
      ratios: {
        currentRatio,
        quickRatio,
        debtToEquity,
        grossMargin,
        netMargin,
        dso,
        dpo,
        returnOnAssets,
        returnOnEquity,
      },
      balances: {
        totalAssets,
        currentAssets,
        totalLiabilities,
        currentLiabilities,
        totalEquity,
        inventory,
        totalRevenue,
        totalExpenses,
        netIncome,
        receivablesDue,
        payablesDue,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
