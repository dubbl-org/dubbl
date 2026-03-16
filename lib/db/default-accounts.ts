import { db } from "./index";
import { chartAccount } from "./schema";
import { eq, sql } from "drizzle-orm";
import { getAccountsForCountry, GENERIC_ACCOUNTS } from "./chart-templates";

/** @deprecated Use getAccountsForCountry() for country-specific templates */
export const DEFAULT_ACCOUNTS = GENERIC_ACCOUNTS;

export async function seedDefaultAccounts(
  orgId: string,
  currencyCode: string,
  countryCode?: string,
) {
  const existing = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(chartAccount)
    .where(eq(chartAccount.organizationId, orgId));

  if ((existing[0]?.count || 0) > 0) return;

  const accounts = getAccountsForCountry(countryCode || "");

  await db
    .insert(chartAccount)
    .values(
      accounts.map((a) => ({
        organizationId: orgId,
        code: a.code,
        name: a.name,
        type: a.type,
        subType: a.subType,
        currencyCode: currencyCode,
      }))
    )
    .onConflictDoNothing();
}
