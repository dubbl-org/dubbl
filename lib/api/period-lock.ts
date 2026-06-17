import { db } from "@/lib/db";
import { periodLock, fiscalYear } from "@/lib/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { hasPermission } from "@/lib/plans";
import type { AuthContext } from "@/lib/api/auth-context";

export class PeriodLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodLockedError";
  }
}

/**
 * Determine whether the caller holds the `bypass:period-lock` permission, which
 * relaxes the effective lock date from `lockDate` to `advisorLockDate`.
 * Mirrors the resolution order in `requireRole`: custom permission arrays take
 * precedence over the legacy role.
 */
function canBypassPeriodLock(ctx?: AuthContext): boolean {
  if (!ctx) return false;
  if (ctx.permissions) {
    return hasPermission(ctx.permissions, "bypass:period-lock");
  }
  return hasPermission(ctx.role, "bypass:period-lock");
}

/**
 * Check if a date falls within a locked period or a closed fiscal year.
 *
 * Two-tier lock dates:
 * - Staff (no `bypass:period-lock` permission) are blocked for dates on or
 *   before `lockDate`.
 * - Callers holding `bypass:period-lock` (e.g. advisors) are only blocked for
 *   dates on or before `advisorLockDate`.
 * - When `advisorLockDate` is null, it falls back to `lockDate` for everyone.
 *
 * Throws PeriodLockedError if the date is on or before the effective lock date,
 * or if the date falls within a closed fiscal year.
 *
 * `ctx` is optional and defaults to the strict (staff) treatment, so existing
 * call sites that omit it keep the original behaviour.
 */
export async function assertNotLocked(
  organizationId: string,
  date: string,
  ctx?: AuthContext
): Promise<void> {
  const lock = await db.query.periodLock.findFirst({
    where: eq(periodLock.organizationId, organizationId),
  });

  if (lock) {
    // Advisors (bypass:period-lock) use advisorLockDate when set; everyone
    // else — and advisors when advisorLockDate is null — use lockDate.
    const effectiveLockDate =
      canBypassPeriodLock(ctx) && lock.advisorLockDate
        ? lock.advisorLockDate
        : lock.lockDate;

    if (date <= effectiveLockDate) {
      throw new PeriodLockedError(
        `Period is locked through ${effectiveLockDate}. Cannot create or modify entries on or before this date.`
      );
    }
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
