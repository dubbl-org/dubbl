import { db } from "@/lib/db";
import { organization, stripeIntegration } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureAccountByCode } from "@/lib/api/journal-automation";

/** A transaction handle, derived from db.transaction's callback parameter. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
/** Either the pool or an open transaction — for helpers that must honor a tx. */
type DbOrTx = typeof db | Tx;

/**
 * Standard chart accounts a Stripe integration posts to. We connect these
 * automatically (creating them on demand for an org whose chart predates them)
 * rather than make the user map accounts by hand before they can sync:
 *   • clearing → Undeposited Funds (1250): money Stripe holds before payout
 *   • revenue  → Sales Revenue (4000)
 *   • fees     → Bank Fees & Charges (5900): Stripe's processing fees
 */
const STRIPE_ACCOUNTS = {
  clearing: { code: "1250", name: "Undeposited Funds", type: "asset" as const, subType: "current" },
  revenue: { code: "4000", name: "Sales Revenue", type: "revenue" as const, subType: "operating" },
  fees: { code: "5900", name: "Bank Fees & Charges", type: "expense" as const, subType: "operating" },
};

/**
 * Ensure the default Stripe GL accounts exist for an org and return their ids.
 * Safe to call repeatedly — ensureAccountByCode is find-or-create — and replaces
 * the old "suggest the first matching account or null" behaviour that left new
 * integrations unable to sync.
 */
export async function ensureStripeAccounts(organizationId: string, exec: DbOrTx = db) {
  const org = await exec.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true },
  });
  const base = org?.defaultCurrency ?? "USD";

  // Sequential (not Promise.all) so this is safe when exec is an open transaction.
  const clearing = await ensureAccountByCode(organizationId, STRIPE_ACCOUNTS.clearing, base, exec);
  const revenue = await ensureAccountByCode(organizationId, STRIPE_ACCOUNTS.revenue, base, exec);
  const fees = await ensureAccountByCode(organizationId, STRIPE_ACCOUNTS.fees, base, exec);

  return {
    clearingAccountId: clearing?.id ?? null,
    revenueAccountId: revenue?.id ?? null,
    feesAccountId: fees?.id ?? null,
  };
}

type MappableIntegration = {
  id: string;
  organizationId: string;
  clearingAccountId: string | null;
  revenueAccountId: string | null;
  feesAccountId: string | null;
};

/**
 * Self-heal an integration whose account mappings are missing (older
 * integrations connected before auto-mapping, or one a user cleared): connect
 * the standard default accounts and persist them, mutating the passed row in
 * place so the caller's event handlers see the mapping. No-op when already
 * mapped, so it's cheap to call on every sync/webhook.
 */
export async function ensureIntegrationAccountsMapped(
  integration: MappableIntegration,
  exec: DbOrTx = db
): Promise<void> {
  if (integration.clearingAccountId && integration.revenueAccountId && integration.feesAccountId) {
    return;
  }
  const ids = await ensureStripeAccounts(integration.organizationId, exec);
  const patch = {
    clearingAccountId: integration.clearingAccountId ?? ids.clearingAccountId,
    revenueAccountId: integration.revenueAccountId ?? ids.revenueAccountId,
    feesAccountId: integration.feesAccountId ?? ids.feesAccountId,
  };
  await exec
    .update(stripeIntegration)
    .set(patch)
    .where(eq(stripeIntegration.id, integration.id));
  integration.clearingAccountId = patch.clearingAccountId;
  integration.revenueAccountId = patch.revenueAccountId;
  integration.feesAccountId = patch.feesAccountId;
}
