import { db } from "@/lib/db";
import { periodLock, fiscalYear } from "@/lib/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";

export class PeriodLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodLockedError";
  }
}

/**
 * Check if a date falls within a locked period or a closed fiscal year.
 * Throws PeriodLockedError if the date is on or before the lock date,
 * or if the date falls within a closed fiscal year.
 */
export async function assertNotLocked(organizationId: string, date: string): Promise<void> {
  const lock = await db.query.periodLock.findFirst({
    where: eq(periodLock.organizationId, organizationId),
  });

  if (lock && date <= lock.lockDate) {
    throw new PeriodLockedError(
      `Period is locked through ${lock.lockDate}. Cannot create or modify entries on or before this date.`
    );
  }

  // Check if date falls within a closed fiscal year
  const closedFY = await db.query.fiscalYear.findFirst({
    where: and(
      eq(fiscalYear.organizationId, organizationId),
      eq(fiscalYear.isClosed, true),
      lte(fiscalYear.startDate, date),
      gte(fiscalYear.endDate, date)
    ),
  });

  if (closedFY) {
    throw new PeriodLockedError(
      `Date falls within closed fiscal year "${closedFY.name}" (${closedFY.startDate} to ${closedFY.endDate}). Reopen the fiscal year to modify entries in this period.`
    );
  }
}
