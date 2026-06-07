import { db } from "@/lib/db";
import { and, isNotNull, lt } from "drizzle-orm";
import { TRASHABLE_ENTITIES } from "./trash-entities";

export async function processTrashPurgeMaintenance() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let totalPurged = 0;
  let failed = 0;

  for (const entity of TRASHABLE_ENTITIES) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = entity.table as any;
      const result = await db
        .delete(table)
        .where(
          and(
            isNotNull(table.deletedAt),
            lt(table.deletedAt, thirtyDaysAgo),
          )
        );
      totalPurged += result.rowCount ?? 0;
    } catch (err) {
      failed++;
      console.error(`Trash purge failed for ${entity.type}:`, err);
    }
  }

  return { purged: totalPurged, failed };
}
