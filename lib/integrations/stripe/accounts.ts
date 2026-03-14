import { db } from "@/lib/db";
import { chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Find candidate accounts for Stripe integration mappings.
 * Returns the first matching account of each type so the UI can suggest defaults,
 * but the user must explicitly confirm or choose different accounts.
 * No accounts are auto-created - every org has its own chart of accounts.
 */
export async function suggestStripeAccounts(organizationId: string) {
  const accounts = await db.query.chartAccount.findMany({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.isActive, true),
      notDeleted(chartAccount.deletedAt)
    ),
    orderBy: chartAccount.code,
  });

  // Suggest first asset account as clearing
  const clearingCandidate = accounts.find(
    (a) => a.type === "asset" && (a.subType === "current_asset" || !a.subType)
  );

  // Suggest first revenue account
  const revenueCandidate = accounts.find((a) => a.type === "revenue");

  // Suggest first expense account as fees
  const feesCandidate = accounts.find((a) => a.type === "expense");

  return {
    clearingAccountId: clearingCandidate?.id ?? null,
    revenueAccountId: revenueCandidate?.id ?? null,
    feesAccountId: feesCandidate?.id ?? null,
  };
}
