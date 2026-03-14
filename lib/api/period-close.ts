import { db } from "@/lib/db";
import {
  fiscalYear,
  journalEntry,
  journalLine,
  chartAccount,
  periodLock,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";

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

  // Find Retained Earnings account (code "3200")
  const retainedEarnings = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, "3200")
    ),
  });

  if (!retainedEarnings) {
    return { success: false, error: "Retained Earnings account (code 3200) not found" };
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
