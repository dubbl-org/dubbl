import { db } from "@/lib/db";
import {
  fixedAsset,
  depreciationEntry,
  journalEntry,
  journalLine,
  loan,
  loanSchedule,
  bankAccount,
  revenueSchedule,
  revenueEntry,
  organization,
} from "@/lib/db/schema";
import { eq, and, sql, lte, isNull } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { autoReconcileBankTransactions } from "./bank-auto-reconcile";
import { checkBudgetVariances } from "./budget-alerts";
import { checkLowBankBalances } from "./bank-balance-alerts";

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function processDepreciation(): Promise<{ processed: number; skipped: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7); // "YYYY-MM"

  const assets = await db.query.fixedAsset.findMany({
    where: and(
      eq(fixedAsset.status, "active"),
      isNull(fixedAsset.deletedAt)
    ),
  });

  let processed = 0;
  let skipped = 0;

  for (const asset of assets) {
    if (!asset.depreciationAccountId || !asset.accumulatedDepAccountId) {
      skipped++;
      continue;
    }

    // Idempotency: check if depreciation entry exists for current month
    const existingEntry = await db.query.depreciationEntry.findFirst({
      where: and(
        eq(depreciationEntry.fixedAssetId, asset.id),
        sql`${depreciationEntry.date} >= ${currentMonth + "-01"}`,
        sql`${depreciationEntry.date} < ${currentMonth + "-32"}`
      ),
    });

    if (existingEntry) {
      skipped++;
      continue;
    }

    // Calculate depreciation amount
    let amount: number;
    if (asset.depreciationMethod === "straight_line") {
      amount = Math.round((asset.purchasePrice - asset.residualValue) / asset.usefulLifeMonths);
    } else {
      // declining_balance
      amount = Math.round(asset.netBookValue * (2 / asset.usefulLifeMonths));
      // Cap at netBookValue - residualValue
      amount = Math.min(amount, asset.netBookValue - asset.residualValue);
    }

    if (amount <= 0) {
      // Fully depreciated
      if (asset.netBookValue <= asset.residualValue) {
        await db
          .update(fixedAsset)
          .set({ status: "fully_depreciated", updatedAt: new Date() })
          .where(eq(fixedAsset.id, asset.id));
      }
      skipped++;
      continue;
    }

    const entryNumber = await getNextEntryNumber(asset.organizationId);

    // Create journal entry: DR depreciation expense, CR accumulated depreciation
    const [je] = await db
      .insert(journalEntry)
      .values({
        organizationId: asset.organizationId,
        entryNumber,
        date: today,
        description: `Monthly depreciation - ${asset.name}`,
        reference: asset.assetNumber,
        status: "posted",
        sourceType: "depreciation",
        sourceId: asset.id,
        postedAt: new Date(),
      })
      .returning();

    await db.insert(journalLine).values([
      {
        journalEntryId: je.id,
        accountId: asset.depreciationAccountId,
        description: `Depreciation - ${asset.name}`,
        debitAmount: amount,
        creditAmount: 0,
      },
      {
        journalEntryId: je.id,
        accountId: asset.accumulatedDepAccountId,
        description: `Accumulated depreciation - ${asset.name}`,
        debitAmount: 0,
        creditAmount: amount,
      },
    ]);

    // Insert depreciation entry
    await db.insert(depreciationEntry).values({
      fixedAssetId: asset.id,
      date: today,
      amount,
      journalEntryId: je.id,
    });

    // Update asset
    const newAccum = asset.accumulatedDepreciation + amount;
    const newNbv = asset.netBookValue - amount;

    await db
      .update(fixedAsset)
      .set({
        accumulatedDepreciation: newAccum,
        netBookValue: newNbv,
        status: newNbv <= asset.residualValue ? "fully_depreciated" : "active",
        updatedAt: new Date(),
      })
      .where(eq(fixedAsset.id, asset.id));

    processed++;
  }

  return { processed, skipped };
}

export async function processLoanPayments(): Promise<{ processed: number; skipped: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const activeLoans = await db.query.loan.findMany({
    where: and(
      eq(loan.status, "active"),
      isNull(loan.deletedAt)
    ),
  });

  let processed = 0;
  let skipped = 0;

  for (const l of activeLoans) {
    if (!l.principalAccountId || !l.interestAccountId) {
      skipped++;
      continue;
    }

    // Find unposted schedule entries due on or before today
    const dueEntries = await db.query.loanSchedule.findMany({
      where: and(
        eq(loanSchedule.loanId, l.id),
        eq(loanSchedule.posted, false),
        lte(loanSchedule.date, today)
      ),
    });

    if (dueEntries.length === 0) {
      skipped++;
      continue;
    }

    // Get the bank account's chart account for the CR side
    let bankChartAccountId: string | null = null;
    if (l.bankAccountId) {
      const ba = await db.query.bankAccount.findFirst({
        where: eq(bankAccount.id, l.bankAccountId),
      });
      bankChartAccountId = ba?.chartAccountId ?? null;
    }

    if (!bankChartAccountId) {
      skipped++;
      continue;
    }

    for (const entry of dueEntries) {
      const entryNumber = await getNextEntryNumber(l.organizationId);

      // Create journal entry: DR Principal + DR Interest, CR Bank
      const [je] = await db
        .insert(journalEntry)
        .values({
          organizationId: l.organizationId,
          entryNumber,
          date: entry.date,
          description: `Loan payment #${entry.periodNumber} - ${l.name}`,
          reference: l.name,
          status: "posted",
          sourceType: "loan_payment",
          sourceId: l.id,
          postedAt: new Date(),
        })
        .returning();

      const lines: {
        journalEntryId: string;
        accountId: string;
        description: string;
        debitAmount: number;
        creditAmount: number;
      }[] = [];

      if (entry.principalAmount > 0) {
        lines.push({
          journalEntryId: je.id,
          accountId: l.principalAccountId,
          description: `Loan principal - ${l.name}`,
          debitAmount: entry.principalAmount,
          creditAmount: 0,
        });
      }

      if (entry.interestAmount > 0) {
        lines.push({
          journalEntryId: je.id,
          accountId: l.interestAccountId,
          description: `Loan interest - ${l.name}`,
          debitAmount: entry.interestAmount,
          creditAmount: 0,
        });
      }

      lines.push({
        journalEntryId: je.id,
        accountId: bankChartAccountId,
        description: `Loan payment - ${l.name}`,
        debitAmount: 0,
        creditAmount: entry.totalPayment,
      });

      await db.insert(journalLine).values(lines);

      // Update schedule entry
      await db
        .update(loanSchedule)
        .set({ posted: true, journalEntryId: je.id })
        .where(eq(loanSchedule.id, entry.id));

      processed++;
    }

    // Check if all entries are posted - if so, mark loan as paid off
    const remaining = await db.query.loanSchedule.findFirst({
      where: and(
        eq(loanSchedule.loanId, l.id),
        eq(loanSchedule.posted, false)
      ),
    });

    if (!remaining) {
      await db
        .update(loan)
        .set({ status: "paid_off", updatedAt: new Date() })
        .where(eq(loan.id, l.id));
    }
  }

  return { processed, skipped };
}

export async function processRevenueRecognition(): Promise<{ processed: number; skipped: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const schedules = await db.query.revenueSchedule.findMany({
    where: eq(revenueSchedule.status, "active"),
  });

  let processed = 0;
  let skipped = 0;

  for (const schedule of schedules) {
    if (!schedule.deferredRevenueAccountId || !schedule.revenueAccountId) {
      skipped++;
      continue;
    }

    // Find unrecognized entries due on or before today
    const dueEntries = await db.query.revenueEntry.findMany({
      where: and(
        eq(revenueEntry.scheduleId, schedule.id),
        eq(revenueEntry.recognized, false),
        lte(revenueEntry.periodDate, today)
      ),
    });

    if (dueEntries.length === 0) {
      skipped++;
      continue;
    }

    for (const entry of dueEntries) {
      const entryNumber = await getNextEntryNumber(schedule.organizationId);

      // Create journal entry: DR Deferred Revenue (liability), CR Revenue
      const [je] = await db
        .insert(journalEntry)
        .values({
          organizationId: schedule.organizationId,
          entryNumber,
          date: entry.periodDate,
          description: `Revenue recognition - period ${entry.periodDate}`,
          status: "posted",
          sourceType: "revenue_recognition",
          sourceId: schedule.id,
          postedAt: new Date(),
        })
        .returning();

      await db.insert(journalLine).values([
        {
          journalEntryId: je.id,
          accountId: schedule.deferredRevenueAccountId,
          description: `Deferred revenue recognition`,
          debitAmount: entry.amount,
          creditAmount: 0,
        },
        {
          journalEntryId: je.id,
          accountId: schedule.revenueAccountId,
          description: `Revenue recognized`,
          debitAmount: 0,
          creditAmount: entry.amount,
        },
      ]);

      // Update revenue entry
      await db
        .update(revenueEntry)
        .set({ recognized: true, journalEntryId: je.id })
        .where(eq(revenueEntry.id, entry.id));

      // Update schedule recognized amount
      await db
        .update(revenueSchedule)
        .set({
          recognizedAmount: sql`${revenueSchedule.recognizedAmount} + ${entry.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(revenueSchedule.id, schedule.id));

      processed++;
    }

    // Check if fully recognized
    const updatedSchedule = await db.query.revenueSchedule.findFirst({
      where: eq(revenueSchedule.id, schedule.id),
    });

    if (updatedSchedule && updatedSchedule.recognizedAmount >= updatedSchedule.totalAmount) {
      await db
        .update(revenueSchedule)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(revenueSchedule.id, schedule.id));
    }
  }

  return { processed, skipped };
}

export async function processBookkeepingCron(): Promise<{
  depreciation: { processed: number; skipped: number };
  loanPayments: { processed: number; skipped: number };
  revenueRecognition: { processed: number; skipped: number };
  autoReconciliation: { checked: number; reconciled: number; skipped: number };
  budgetAlerts: { checked: number; alerted: number };
  balanceAlerts: { checked: number; alerted: number };
}> {
  const depreciation = await processDepreciation();
  const loanPayments = await processLoanPayments();
  const revenueRecognition = await processRevenueRecognition();

  // Auto-reconcile for all orgs with unreconciled transactions
  let totalChecked = 0;
  let totalReconciled = 0;
  let totalSkipped = 0;

  const orgs = await db
    .select({ id: organization.id })
    .from(organization);

  for (const org of orgs) {
    try {
      const result = await autoReconcileBankTransactions(org.id);
      totalChecked += result.checked;
      totalReconciled += result.reconciled;
      totalSkipped += result.skipped;
    } catch {
      // Non-critical, continue
    }
  }

  const budgetAlerts = await checkBudgetVariances();
  const balanceAlerts = await checkLowBankBalances();

  return {
    depreciation,
    loanPayments,
    revenueRecognition,
    autoReconciliation: { checked: totalChecked, reconciled: totalReconciled, skipped: totalSkipped },
    budgetAlerts,
    balanceAlerts,
  };
}
