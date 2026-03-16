import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fiscalYear,
  journalEntry,
  journalLine,
  chartAccount,
  periodLock,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, error, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:period-lock");

    // Get fiscal year and verify ownership
    const fy = await db.query.fiscalYear.findFirst({
      where: and(
        eq(fiscalYear.id, id),
        eq(fiscalYear.organizationId, ctx.organizationId)
      ),
    });

    if (!fy) {
      return notFound("Fiscal year");
    }

    if (fy.isClosed) {
      return error("Fiscal year is already closed", 400);
    }

    // Check for draft journal entries in the fiscal year date range
    const draftEntries = await db
      .select({ count: sql<number>`count(*)` })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "draft"),
          gte(journalEntry.date, fy.startDate),
          lte(journalEntry.date, fy.endDate)
        )
      );

    if ((draftEntries[0]?.count || 0) > 0) {
      return error("Cannot close: draft entries exist", 400);
    }

    // Query revenue and expense account balances within the fiscal year
    const accountBalances = await db
      .select({
        accountId: chartAccount.id,
        accountType: chartAccount.type,
        totalDebit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
        totalCredit: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          gte(journalEntry.date, fy.startDate),
          lte(journalEntry.date, fy.endDate),
          inArray(chartAccount.type, ["revenue", "expense"])
        )
      )
      .groupBy(chartAccount.id, chartAccount.type);

    // Find Retained Earnings account (code "3200")
    const retainedEarnings = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "3200")
      ),
    });

    if (!retainedEarnings) {
      return error("Retained Earnings account (code 3200) not found", 400);
    }

    // Calculate balances and build closing lines
    const closingLines: {
      accountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }[] = [];

    let totalRevenueBalance = 0;
    let totalExpenseBalance = 0;

    for (const row of accountBalances) {
      if (row.accountType === "revenue") {
        // Revenue balance = credits - debits
        const balance = Number(row.totalCredit) - Number(row.totalDebit);
        if (balance !== 0) {
          totalRevenueBalance += balance;
          // Close revenue: DR Revenue to zero it out
          closingLines.push({
            accountId: row.accountId,
            debitAmount: Math.abs(balance),
            creditAmount: 0,
            description: "Year-end closing - revenue",
          });
        }
      } else if (row.accountType === "expense") {
        // Expense balance = debits - credits
        const balance = Number(row.totalDebit) - Number(row.totalCredit);
        if (balance !== 0) {
          totalExpenseBalance += balance;
          // Close expense: CR Expense to zero it out
          closingLines.push({
            accountId: row.accountId,
            debitAmount: 0,
            creditAmount: Math.abs(balance),
            description: "Year-end closing - expense",
          });
        }
      }
    }

    // Net income = revenue balance - expense balance
    const netIncome = totalRevenueBalance - totalExpenseBalance;

    if (netIncome !== 0) {
      // Net to Retained Earnings
      closingLines.push({
        accountId: retainedEarnings.id,
        debitAmount: netIncome < 0 ? Math.abs(netIncome) : 0,
        creditAmount: netIncome > 0 ? netIncome : 0,
        description: "Year-end closing - net income to retained earnings",
      });
    }

    // Only create closing entry if there are lines to close
    if (closingLines.length > 0) {
      const entryNumber = await getNextEntryNumber(ctx.organizationId);

      const [closingEntry] = await db
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: fy.endDate,
          description: `Year-end closing entry for ${fy.name}`,
          sourceType: "year_end_close",
          sourceId: fy.id,
          status: "posted",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      await db.insert(journalLine).values(
        closingLines.map((line) => ({
          journalEntryId: closingEntry.id,
          accountId: line.accountId,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
        }))
      );
    }

    // Mark fiscal year as closed
    await db
      .update(fiscalYear)
      .set({ isClosed: true })
      .where(eq(fiscalYear.id, fy.id));

    // Upsert period lock with lockDate = fiscal year endDate
    await db
      .delete(periodLock)
      .where(eq(periodLock.organizationId, ctx.organizationId));

    await db.insert(periodLock).values({
      organizationId: ctx.organizationId,
      lockDate: fy.endDate,
      lockedBy: ctx.userId,
      reason: `Fiscal year ${fy.name} closed`,
    });

    const updated = await db.query.fiscalYear.findFirst({
      where: eq(fiscalYear.id, fy.id),
    });

    logAudit({ ctx, action: "close", entityType: "fiscal_year", entityId: id, changes: { previousStatus: "open" }, request });

    return NextResponse.json({ fiscalYear: updated });
  } catch (err) {
    return handleError(err);
  }
}
