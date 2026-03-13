import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  handleChargeSucceeded,
  handleCustomerCreated,
  handlePayoutPaid,
} from "./sync";

export async function runInitialSync(integrationId: string) {
  const integration = await db.query.stripeIntegration.findFirst({
    where: eq(stripeIntegration.id, integrationId),
  });

  if (!integration) throw new Error("Integration not found");

  const stripe = new Stripe(integration.accessToken, { typescript: true });
  const days = integration.initialSyncDays;
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  try {
    // 1. Sync customers (all, no date filter)
    for await (const customer of stripe.customers.list(
      { limit: 100 },
      { stripeAccount: integration.stripeAccountId }
    )) {
      try {
        await handleCustomerCreated(integration, customer);
      } catch (err) {
        await db.insert(stripeSyncLog).values({
          integrationId,
          eventType: "customer.created",
          stripeEventId: null,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          payload: { customerId: customer.id },
        });
      }
    }

    // 2. Sync charges from last N days
    for await (const charge of stripe.charges.list(
      { limit: 100, created: { gte: since } },
      { stripeAccount: integration.stripeAccountId }
    )) {
      try {
        if (charge.status === "succeeded") {
          await handleChargeSucceeded(integration, charge);
        }
      } catch (err) {
        await db.insert(stripeSyncLog).values({
          integrationId,
          eventType: "charge.succeeded",
          stripeEventId: null,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          payload: { chargeId: charge.id },
        });
      }
    }

    // 3. Sync paid payouts from last N days
    for await (const payout of stripe.payouts.list(
      { limit: 100, created: { gte: since }, status: "paid" },
      { stripeAccount: integration.stripeAccountId }
    )) {
      try {
        await handlePayoutPaid(integration, payout);
      } catch (err) {
        await db.insert(stripeSyncLog).values({
          integrationId,
          eventType: "payout.paid",
          stripeEventId: null,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          payload: { payoutId: payout.id },
        });
      }
    }

    // Mark initial sync completed
    await db
      .update(stripeIntegration)
      .set({
        initialSyncCompleted: true,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stripeIntegration.id, integrationId));

    await db.insert(stripeSyncLog).values({
      integrationId,
      eventType: "initial_sync",
      status: "success",
      payload: { days },
    });
  } catch (err) {
    await db
      .update(stripeIntegration)
      .set({
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Initial sync failed",
        updatedAt: new Date(),
      })
      .where(eq(stripeIntegration.id, integrationId));

    await db.insert(stripeSyncLog).values({
      integrationId,
      eventType: "initial_sync",
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
