import { db } from "@/lib/db";
import { chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function findOrCreateAccount(
  organizationId: string,
  code: string,
  name: string,
  type: "asset" | "liability" | "equity" | "revenue" | "expense",
  subType?: string
) {
  const existing = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, code)
    ),
  });

  if (existing) return existing;

  const [created] = await db
    .insert(chartAccount)
    .values({
      organizationId,
      code,
      name,
      type,
      subType: subType ?? null,
    })
    .returning();

  return created;
}

export async function ensureStripeAccounts(organizationId: string) {
  const clearingAccount = await findOrCreateAccount(
    organizationId,
    "1350",
    "Stripe Clearing",
    "asset",
    "current_asset"
  );

  const feesAccount = await findOrCreateAccount(
    organizationId,
    "6150",
    "Payment Processing Fees",
    "expense"
  );

  // Use existing revenue account (code 4100), don't auto-create
  const revenueAccount = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, "4100")
    ),
  });

  return {
    clearingAccountId: clearingAccount.id,
    feesAccountId: feesAccount.id,
    revenueAccountId: revenueAccount?.id ?? null,
  };
}
