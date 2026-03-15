import { db } from "@/lib/db";
import { stripeIntegration, stripeEntityMap } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import Stripe from "stripe";
import { stripe as _stripeClient } from "@/lib/stripe";

// Non-null wrapper - callers already guard for null stripe
const stripe = _stripeClient!;

export interface ReconciliationResult {
  matched: number;
  missingLocal: { id: string; type: string; amount: number; created: number }[];
  totalChecked: number;
}

export async function reconcileStripeBalance(
  integrationId: string,
  orgId: string,
  days: number
): Promise<ReconciliationResult> {
  const integration = await db.query.stripeIntegration.findFirst({
    where: and(
      eq(stripeIntegration.id, integrationId),
      notDeleted(stripeIntegration.deletedAt)
    ),
  });

  if (!integration) throw new Error("Integration not found");

  const since = Math.floor(Date.now() / 1000) - days * 86400;

  let matched = 0;
  const missingLocal: ReconciliationResult["missingLocal"] = [];
  let totalChecked = 0;

  // Fetch balance transactions from Stripe
  const transactions: Stripe.BalanceTransaction[] = [];
  for await (const txn of stripe.balanceTransactions.list(
    { created: { gte: since }, limit: 100 },
    { stripeAccount: integration.stripeAccountId }
  )) {
    transactions.push(txn);
    if (transactions.length >= 500) break; // Safety limit
  }

  for (const txn of transactions) {
    totalChecked++;

    // Map Stripe balance transaction type to our entity types
    let stripeEntityType: string | null = null;
    let stripeEntityId: string | null = null;

    if (txn.type === "charge" && txn.source && typeof txn.source === "string") {
      stripeEntityType = "charge";
      stripeEntityId = txn.source;
    } else if (txn.type === "payout" && txn.source && typeof txn.source === "string") {
      stripeEntityType = "payout";
      stripeEntityId = txn.source;
    } else if (txn.type === "refund" && txn.source && typeof txn.source === "string") {
      stripeEntityType = "refund";
      stripeEntityId = txn.source;
    } else if (txn.type === "adjustment" && txn.source && typeof txn.source === "string") {
      stripeEntityType = "dispute";
      stripeEntityId = txn.source;
    } else {
      continue; // Skip types we don't track
    }

    // Check if we have it locally
    const existing = await db.query.stripeEntityMap.findFirst({
      where: and(
        eq(stripeEntityMap.organizationId, orgId),
        eq(stripeEntityMap.stripeEntityType, stripeEntityType),
        eq(stripeEntityMap.stripeEntityId, stripeEntityId)
      ),
    });

    if (existing) {
      matched++;
    } else {
      missingLocal.push({
        id: stripeEntityId,
        type: stripeEntityType,
        amount: txn.amount,
        created: txn.created,
      });
    }
  }

  return { matched, missingLocal, totalChecked };
}
