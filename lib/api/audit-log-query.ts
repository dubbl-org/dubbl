import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { eq, and, or, desc, gte, lt, lte, ilike, inArray, sql } from "drizzle-orm";
import { getOrgPlanLimits } from "@/lib/api/check-limit";

export interface AuditLogFilters {
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
  action?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
}

/**
 * One page of the audit log (newest first) within the plan's history window,
 * plus the count per action across every entry matching the other filters
 * (what the Audit Log tabs show). Shared by the REST route and MCP.
 */
export async function queryAuditLog(
  organizationId: string,
  filters: AuditLogFilters,
  { limit, offset }: { limit: number; offset: number }
) {
  const { entityType, entityId, userId, action, startDate, endDate } = filters;
  const search = filters.search?.trim();

  // Clamp date range based on plan's auditLogDays
  const { limits } = await getOrgPlanLimits(organizationId);
  const minDate = limits.auditLogDays === Infinity
    ? null
    : new Date(Date.now() - limits.auditLogDays * 24 * 60 * 60 * 1000);

  const conditions = [eq(auditLog.organizationId, organizationId)];
  if (minDate) {
    conditions.push(gte(auditLog.createdAt, minDate));
  }

  if (entityType) {
    conditions.push(eq(auditLog.entityType, entityType));
  }
  if (entityId) {
    conditions.push(eq(auditLog.entityId, entityId));
  }
  if (userId) {
    conditions.push(eq(auditLog.userId, userId));
  }
  if (startDate) {
    conditions.push(gte(auditLog.createdAt, new Date(startDate)));
  }
  if (endDate) {
    // A plain date includes that whole day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const next = new Date(`${endDate}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      conditions.push(lt(auditLog.createdAt, next));
    } else {
      conditions.push(lte(auditLog.createdAt, new Date(endDate)));
    }
  }
  // Search every entry, not just one page: who did it (name or email), the
  // action, the kind of record ("journal entry" matches journal_entry) or
  // the start of the record's id.
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const typeLike = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\s+/g, "\\_")}%`;
    conditions.push(
      or(
        ilike(auditLog.action, like),
        ilike(auditLog.entityType, typeLike),
        ilike(sql`${auditLog.entityId}::text`, like),
        inArray(
          auditLog.userId,
          db.select({ id: users.id }).from(users).where(or(ilike(users.name, like), ilike(users.email, like)))
        )
      )!
    );
  }

  // Counts per action for the tabs: every filter except the action itself.
  const actionCountRows = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLog)
    .where(and(...conditions))
    .groupBy(auditLog.action);
  const actionCounts = Object.fromEntries(actionCountRows.map((r) => [r.action, r.count]));
  const allTotal = actionCountRows.reduce((sum, r) => sum + r.count, 0);

  if (action) {
    conditions.push(eq(auditLog.action, action));
  }

  const entries = await db.query.auditLog.findMany({
    where: and(...conditions),
    orderBy: desc(auditLog.createdAt),
    limit,
    offset,
    with: {
      user: { columns: { id: true, name: true, email: true, image: true } },
    },
  });

  const data = entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt,
    userName: entry.user?.name || entry.user?.email || "Unknown",
  }));

  const total = action ? actionCounts[action] ?? 0 : allTotal;
  return { data, total, actionCounts, allTotal };
}
