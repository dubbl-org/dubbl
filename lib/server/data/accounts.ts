import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chartAccount } from "@/lib/db/schema";

/** Chart of accounts, mirroring GET /api/v1/accounts (ordered by code). */
export async function listChartAccounts(organizationId: string) {
  return db.query.chartAccount.findMany({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      isNull(chartAccount.deletedAt)
    ),
    orderBy: chartAccount.code,
  });
}
