import { db } from "@/lib/db";
import {
  fixedAsset,
  journalEntry,
  journalLine,
  loan,
  loanSchedule,
  bankAccount,
  organization,
} from "@/lib/db/schema";
import { eq, and, sql, lte, isNull } from "drizzle-orm";
import { autoReconcileBankTransactions } from "./bank-auto-reconcile";
import { checkBudgetVariances } from "./budget-alerts";
import { checkLowBankBalances } from "./bank-balance-alerts";
import { processDueRevenueRecognition } from "./revenue-schedules";
import { assertNotLocked, PeriodLockedError } from "./period-lock";
import { postAssetDepreciation } from "@/lib/fixed-assets/post-depreciation";

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function processDepreciation(): Promise<{ processed: number; skipped: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const assets = await db.query.fixedAsset.findMany({
    where: and(
      eq(fixedAsset.status, "active"),
      isNull(fixedAsset.deletedAt)
    ),
  });

  let processed = 0;
  let skipped = 0;

  for (const asset of assets) {
    // The nightly job only books assets it can post to the ledger.
    if (!asset.depreciationAccountId || !asset.accumulatedDepAccountId) {
      skipped++;
      continue;
    }

    // Same calculation, once-a-month guard and lock check as the manual run.
    try {
      const result = await postAssetDepreciation(asset, { date: today });
      if (result.status === "posted") processed++;
      else skipped++;
    } catch (err) {
      // A locked period skips the asset; it's picked up once the date is open.
      if (err instanceof PeriodLockedError) {
        skipped++;
        continue;
      }
      throw err;
    }
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
      // A payment dated in a locked period is left for someone to post by hand.
      try {
        await assertNotLocked(l.organizationId, entry.date);
      } catch (err) {
        if (err instanceof PeriodLockedError) {
          skipped++;
          continue;
        }
        throw err;
      }

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

/**
 * Count every revenue-schedule period whose date has arrived (DR Deferred
 * Revenue / CR income). Shares the posting code with the "Count next period"
 * button, so it resolves accounts, honours period locks and skips milestone
 * schedules the same way.
 */
export async function processRevenueRecognition(): Promise<{ processed: number; skipped: number }> {
  return processDueRevenueRecognition();
}

export async function processBookkeepingMaintenance(): Promise<{
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
