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

    if (!budgetId) {
      return NextResponse.json({ error: "budgetId is required" }, { status: 400 });
    }

    // Fetch the budget with its lines
    const found = await db.query.budget.findFirst({
      where: and(
        eq(budget.id, budgetId),
        eq(budget.organizationId, ctx.organizationId),
        isNull(budget.deletedAt)
      ),
      with: {
        lines: {
          with: { account: true },
        },
      },
    });

    if (!found) return notFound("Budget");

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

    const comparisons = found.lines.map((line) => {
      const act = actualMap.get(line.accountId);
      const accountType = line.account?.type;

      // For expense accounts: actual = debit - credit
      // For revenue accounts: actual = credit - debit
      let actualAmount = 0;
      if (act) {
        if (accountType === "expense" || accountType === "asset") {
          actualAmount = act.debit - act.credit;
        } else {
          actualAmount = act.credit - act.debit;
        }
      }

      const budgeted = line.total;
      const variance = budgeted - actualAmount;
      const variancePct = budgeted === 0 ? 0 : Math.round((variance / budgeted) * 100);

      return {
        accountId: line.accountId,
        accountName: line.account?.name || "Unknown",
        accountCode: line.account?.code || "",
        budgeted,
        actual: actualAmount,
        variance,
        variancePct,
      };
    });

    const totalBudgeted = comparisons.reduce((s, c) => s + c.budgeted, 0);
    const totalActual = comparisons.reduce((s, c) => s + c.actual, 0);
    const totalVariance = totalBudgeted - totalActual;

    return NextResponse.json({
      budget: {
        id: found.id,
        name: found.name,
        startDate: found.startDate,
        endDate: found.endDate,
      },
      comparisons,
      totalBudgeted,
      totalActual,
      totalVariance,
    });
  } catch (err) {
    return handleError(err);
  }
}
