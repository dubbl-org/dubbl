import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Get next sequential number for an entity type.
 * Returns formatted string like "INV-00001"
 */
export async function getNextNumber(
  organizationId: string,
  tableName: string,
  numberColumn: string,
  prefix: string
): Promise<string> {
  const result = await db.execute(
    sql.raw(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE organization_id = '${organizationId}'`
    )
  );

  const count = Number((result as unknown as Array<{ count: string }>)[0]?.count || 0);
  const next = count + 1;
  return `${prefix}-${next.toString().padStart(5, "0")}`;
}
