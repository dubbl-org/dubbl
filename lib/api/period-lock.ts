import { db } from "@/lib/db";
import { periodLock } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export class PeriodLockedError extends Error {
  constructor(lockDate: string) {
    super(`Period is locked through ${lockDate}. Cannot create or modify entries on or before this date.`);
    this.name = "PeriodLockedError";
  }
}

/**
 * Check if a date falls within a locked period for an organization.
 * Throws PeriodLockedError if the date is on or before the lock date.
 */
export async function assertNotLocked(organizationId: string, date: string): Promise<void> {
  const lock = await db.query.periodLock.findFirst({
    where: eq(periodLock.organizationId, organizationId),
  });

  if (lock && date <= lock.lockDate) {
    throw new PeriodLockedError(lock.lockDate);
  }
}
