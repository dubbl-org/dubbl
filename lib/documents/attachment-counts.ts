import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";

/**
 * How many files are attached to each of the given records, counting only the
 * ones this user can see (shared files, plus their own private ones).
 */
export async function attachmentCounts(
  organizationId: string,
  userId: string,
  entityType: string,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  const rows = await db
    .select({ entityId: document.entityId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(document)
    .where(
      and(
        eq(document.organizationId, organizationId),
        eq(document.entityType, entityType),
        inArray(document.entityId, ids),
        isNull(document.deletedAt),
        or(eq(document.visibility, "organization"), eq(document.uploadedBy, userId)),
      ),
    )
    .groupBy(document.entityId);
  for (const r of rows) if (r.entityId) counts.set(r.entityId, r.n);
  return counts;
}
