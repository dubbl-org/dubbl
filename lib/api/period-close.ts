import { db } from "@/lib/db";
import {
  fiscalYear,
  journalEntry,
  journalLine,
  chartAccount,
  periodLock,
  organization,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";

/**
 * Resolve the org's Retained Earnings account for year-end close. Precedence:
 *  1. organization.retainedEarningsAccountId (explicit setting, must be equity)
 *  2. the first equity account with subType 'retained'
 *  3. account code '3100' (Retained Earnings in the standard chart)
 * Returns null if none found. NOTE: the old code hardcoded '3200', which is
 * "Owner's Drawings" in the chart — a real bug that posted net income to the
 * wrong account.
 */
export async function getRetainedEarningsAccount(organizationId: string) {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { retainedEarningsAccountId: true },
  });
  if (org?.retainedEarningsAccountId) {
    const chosen = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, org.retainedEarningsAccountId),
        eq(chartAccount.organizationId, organizationId),
        eq(chartAccount.type, "equity")
      ),
    });
    if (chosen) return chosen;
  }
  const bySubType = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.type, "equity"),
      eq(chartAccount.subType, "retained")
    ),
  });
  if (bySubType) return bySubType;
  return db.query.chartAccount.findFirst({
    where: and(eq(chartAccount.organizationId, organizationId), eq(chartAccount.code, "3100")),
  });
}

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function closeFiscalYear(
  fiscalYearId: string,
  organizationId: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const fy = await db.query.fiscalYear.findFirst({
    where: and(
      eq(fiscalYear.id, fiscalYearId),
      eq(fiscalYear.organizationId, organizationId)
    ),
  });

  if (!fy) return { success: false, error: "Fiscal year not found" };
  if (fy.isClosed) return { success: false, error: "Fiscal year is already closed" };

  // Check for draft journal entries
  const draftEntries = await db
    .select({ count: sql<number>`count(*)` })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "draft"),
        gte(journalEntry.date, fy.startDate),
        lte(journalEntry.date, fy.endDate)
      )
    );

  if ((draftEntries[0]?.count || 0) > 0) {
    return { success: false, error: "Cannot close: draft entries exist" };
  }

  // Query revenue and expense account balances
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
        eq(journalEntry.organizationId, organizationId),
        eq(journalEntry.status, "posted"),
        gte(journalEntry.date, fy.startDate),
        lte(journalEntry.date, fy.endDate),
        inArray(chartAccount.type, ["revenue", "expense"])
      )
    )
    .groupBy(chartAccount.id, chartAccount.type);

  // Resolve Retained Earnings (configurable; defaults to subType 'retained' / code 3100)
  const retainedEarnings = await getRetainedEarningsAccount(organizationId);

  if (!retainedEarnings) {
    return { success: false, error: "Retained Earnings account not found. Set one in organization settings or add an equity account with subType 'retained'." };
  }

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
      const balance = Number(row.totalCredit) - Number(row.totalDebit);
      if (balance !== 0) {
        totalRevenueBalance += balance;
        closingLines.push({
          accountId: row.accountId,
          debitAmount: Math.abs(balance),
          creditAmount: 0,
          description: "Year-end closing - revenue",
        });
      }
    } else if (row.accountType === "expense") {
      const balance = Number(row.totalDebit) - Number(row.totalCredit);
      if (balance !== 0) {
        totalExpenseBalance += balance;
        closingLines.push({
          accountId: row.accountId,
          debitAmount: 0,
          creditAmount: Math.abs(balance),
          description: "Year-end closing - expense",
        });
      }
    }
  }

  const netIncome = totalRevenueBalance - totalExpenseBalance;

  if (netIncome !== 0) {
    closingLines.push({
      accountId: retainedEarnings.id,
      debitAmount: netIncome < 0 ? Math.abs(netIncome) : 0,
      creditAmount: netIncome > 0 ? netIncome : 0,
      description: "Year-end closing - net income to retained earnings",
    });
  }

  if (closingLines.length > 0) {
    const entryNumber = await getNextEntryNumber(organizationId);

    const [closingEntry] = await db
      .insert(journalEntry)
      .values({
        organizationId,
        entryNumber,
        date: fy.endDate,
        description: `Year-end closing entry for ${fy.name}`,
        sourceType: "year_end_close",
        sourceId: fy.id,
        status: "posted",
        postedAt: new Date(),
        createdBy: userId,
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

  await db
    .update(fiscalYear)
    .set({ isClosed: true })
    .where(eq(fiscalYear.id, fy.id));

  await db
    .delete(periodLock)
    .where(eq(periodLock.organizationId, organizationId));

  await db.insert(periodLock).values({
    organizationId,
    lockDate: fy.endDate,
    lockedBy: userId,
    reason: `Fiscal year ${fy.name} closed`,
  });

  return { success: true };
}

export async function reopenFiscalYear(
  fiscalYearId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const fy = await db.query.fiscalYear.findFirst({
    where: and(
      eq(fiscalYear.id, fiscalYearId),
      eq(fiscalYear.organizationId, organizationId)
    ),
  });

  if (!fy) return { success: false, error: "Fiscal year not found" };
  if (!fy.isClosed) return { success: false, error: "Fiscal year is not closed" };

  // Find and void the closing journal entry
  const closingEntry = await db.query.journalEntry.findFirst({
    where: and(
      eq(journalEntry.organizationId, organizationId),
      eq(journalEntry.sourceType, "year_end_close"),
      eq(journalEntry.sourceId, fy.id)
    ),
  });

  if (closingEntry) {
    await db
      .update(journalEntry)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidReason: "Fiscal year reopened",
        updatedAt: new Date(),
      })
      .where(eq(journalEntry.id, closingEntry.id));
  }

  await db
    .update(fiscalYear)
    .set({ isClosed: false })
    .where(eq(fiscalYear.id, fy.id));

  const lock = await db.query.periodLock.findFirst({
    where: eq(periodLock.organizationId, organizationId),
  });

  if (lock && lock.lockDate === fy.endDate) {
    await db
      .delete(periodLock)
      .where(eq(periodLock.id, lock.id));
  }

  return { success: true };
}
