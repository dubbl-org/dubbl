import { db } from "@/lib/db";
import {
  budget,
  budgetLine,
  budgetPeriod,
  journalLine,
  journalEntry,
  member,
  notification,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, inArray, isNull } from "drizzle-orm";
import { sendNotification } from "@/lib/notifications/send";

export async function checkBudgetVariances(): Promise<{ checked: number; alerted: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const activeBudgets = await db.query.budget.findMany({
    where: and(
      eq(budget.isActive, true),
      isNull(budget.deletedAt),
      sql`${budget.varianceThresholdPct} IS NOT NULL`
    ),
    with: {
      lines: {
        with: {
          periods: true,
        },
      },
    },
  });

  let checked = 0;
  let alerted = 0;

  for (const b of activeBudgets) {
    const thresholdPct = b.varianceThresholdPct ?? 100;

    for (const line of b.lines) {
      for (const period of line.periods) {
        // Check if period includes today
        if (period.startDate > today || period.endDate < today) continue;

        checked++;

        if (period.amount <= 0) continue;

        // Get actual spending for this account in this period
        const [actual] = await db
          .select({
            total: sql<number>`coalesce(sum(${journalLine.debitAmount}) - sum(${journalLine.creditAmount}), 0)`,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .where(
            and(
              eq(journalEntry.organizationId, b.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              eq(journalLine.accountId, line.accountId),
              gte(journalEntry.date, period.startDate),
              lte(journalEntry.date, period.endDate)
            )
          );

        const actualAmount = Math.abs(Number(actual?.total ?? 0));
        const thresholdAmount = Math.round((period.amount * thresholdPct) / 100);

        if (actualAmount >= thresholdAmount) {
          // Deduplicate: check if we already sent a notification for this budget period
          const existingAlert = await db.query.notification.findFirst({
            where: and(
              eq(notification.organizationId, b.organizationId),
              eq(notification.type, "budget_exceeded"),
              eq(notification.entityType, "budget_period"),
              eq(notification.entityId, period.id)
            ),
          });

          if (existingAlert) continue;

          // Get org admins/owners
          const admins = await db.query.member.findMany({
            where: and(
              eq(member.organizationId, b.organizationId),
              inArray(member.role, ["owner", "admin"])
            ),
          });

          for (const admin of admins) {
            try {
              await sendNotification({
                orgId: b.organizationId,
                userId: admin.userId,
                type: "budget_exceeded",
                title: `Budget "${b.name}" exceeded threshold`,
                body: `Period ${period.label}: actual $${(actualAmount / 100).toFixed(2)} vs budget $${(period.amount / 100).toFixed(2)} (${thresholdPct}% threshold)`,
                entityType: "budget_period",
                entityId: period.id,
              });
              alerted++;
            } catch {
              // Non-critical
            }
          }
        }
      }
    }
  }

  return { checked, alerted };
}
