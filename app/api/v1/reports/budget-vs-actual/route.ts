import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  budget,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const budgetId = url.searchParams.get("budgetId");

    // If no budgetId, try to find the most recent active budget
    const found = await db.query.budget.findFirst({
      where: budgetId
        ? and(
            eq(budget.id, budgetId),
            eq(budget.organizationId, ctx.organizationId),
            isNull(budget.deletedAt)
          )
        : and(
            eq(budget.organizationId, ctx.organizationId),
            isNull(budget.deletedAt)
          ),
      with: {
        lines: {
          with: {
            account: true,
            periods: true,
          },
        },
      },
    });

    if (!found) {
      return NextResponse.json({
        budget: null,
        comparisons: [],
        totalBudgeted: 0,
        totalActual: 0,
        totalVariance: 0,
        totalBurnRate: 0,
        daysElapsed: 0,
        daysRemaining: 0,
        totalDays: 0,
      });
    }

    // Get actual GL balances for each account in the budget's date range
    const actuals = await db
      .select({
        accountId: journalLine.accountId,
        debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
        credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          gte(journalEntry.date, found.startDate),
          lte(journalEntry.date, found.endDate)
        )
      )
      .groupBy(journalLine.accountId);

    const actualMap = new Map<string, { debit: number; credit: number }>();
    for (const row of actuals) {
      actualMap.set(row.accountId, {
        debit: Number(row.debit),
        credit: Number(row.credit),
      });
    }

    // Get per-period actuals for each account
    const allPeriods = found.lines.flatMap((l) =>
      (l.periods || []).map((p) => ({
        accountId: l.accountId,
        periodId: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
      }))
    );

    // Fetch per-period actuals in bulk using date ranges
    const periodActualMap = new Map<string, { debit: number; credit: number }>();

    if (allPeriods.length > 0) {
      const uniqueDateRanges = new Map<string, { startDate: string; endDate: string }>();
      for (const p of allPeriods) {
        uniqueDateRanges.set(`${p.startDate}_${p.endDate}`, {
          startDate: p.startDate,
          endDate: p.endDate,
        });
      }

      for (const range of uniqueDateRanges.values()) {
        const periodActuals = await db
          .select({
            accountId: journalLine.accountId,
            debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
            credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              gte(journalEntry.date, range.startDate),
              lte(journalEntry.date, range.endDate)
            )
          )
          .groupBy(journalLine.accountId);

        for (const pa of periodActuals) {
          const key = `${pa.accountId}_${range.startDate}_${range.endDate}`;
          periodActualMap.set(key, {
            debit: Number(pa.debit),
            credit: Number(pa.credit),
          });
        }
      }
    }

    // Calculate days for burn rate
    const startMs = new Date(found.startDate + "T00:00:00").getTime();
    const endMs = new Date(found.endDate + "T00:00:00").getTime();
    const nowMs = Date.now();
    const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    const daysElapsed = Math.max(0, Math.min(totalDays, Math.round((nowMs - startMs) / 86400000)));
    const daysRemaining = Math.max(0, totalDays - daysElapsed);

    function computeActual(accountId: string, accountType: string | undefined, actData: { debit: number; credit: number } | undefined): number {
      if (!actData) return 0;
      if (accountType === "expense" || accountType === "asset") {
        return actData.debit - actData.credit;
      }
      return actData.credit - actData.debit;
    }

    const comparisons = found.lines.map((line) => {
      const act = actualMap.get(line.accountId);
      const accountType = line.account?.type;
      const actualAmount = computeActual(line.accountId, accountType, act);
      const budgeted = line.total;
      const variance = budgeted - actualAmount;
      const variancePct = budgeted === 0 ? 0 : Math.round((variance / budgeted) * 100);

      // Per-period breakdown
      const sortedPeriods = [...(line.periods || [])].sort((a, b) => a.sortOrder - b.sortOrder);
      const periodBreakdown = sortedPeriods.map((p) => {
        const key = `${line.accountId}_${p.startDate}_${p.endDate}`;
        const pAct = periodActualMap.get(key);
        const periodActual = computeActual(line.accountId, accountType, pAct);
        return {
          id: p.id,
          label: p.label,
          startDate: p.startDate,
          endDate: p.endDate,
          budgeted: p.amount,
          actual: periodActual,
          variance: p.amount - periodActual,
          sortOrder: p.sortOrder,
        };
      });

      // Burn rate: actual / days elapsed * total days
      const burnRate = daysElapsed > 0 ? Math.round((actualAmount / daysElapsed) * totalDays) : 0;

      return {
        accountId: line.accountId,
        accountName: line.account?.name || "Unknown",
        accountCode: line.account?.code || "",
        budgeted,
        actual: actualAmount,
        variance,
        variancePct,
        burnRate,
        projected: burnRate,
        periods: periodBreakdown,
      };
    });

    const totalBudgeted = comparisons.reduce((s, c) => s + c.budgeted, 0);
    const totalActual = comparisons.reduce((s, c) => s + c.actual, 0);
    const totalVariance = totalBudgeted - totalActual;
    const totalBurnRate = daysElapsed > 0 ? Math.round((totalActual / daysElapsed) * totalDays) : 0;

    return NextResponse.json({
      budget: {
        id: found.id,
        name: found.name,
        startDate: found.startDate,
        endDate: found.endDate,
        periodType: found.periodType,
      },
      comparisons,
      totalBudgeted,
      totalActual,
      totalVariance,
      totalBurnRate,
      daysElapsed,
      daysRemaining,
      totalDays,
    });
  } catch (err) {
    return handleError(err);
  }
}
