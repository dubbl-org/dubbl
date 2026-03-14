import { db } from "@/lib/db";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import {
  handleChargeSucceeded,
  handleCustomerCreated,
  handlePayoutPaid,
  handleTransferCreated,
  handleStripeCreditNoteCreated,
} from "./sync";

export async function runInitialSync(integrationId: string) {
  const integration = await db.query.stripeIntegration.findFirst({
    where: eq(stripeIntegration.id, integrationId),
  });

  if (!integration) throw new Error("Integration not found");

  // Validate account mappings are configured
  if (!integration.clearingAccountId || !integration.revenueAccountId || !integration.feesAccountId) {
    throw new Error("Account mappings must be configured before syncing. Go to Settings > Integrations > Stripe to set clearing, revenue, and fees accounts.");
  }

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

    // 4. Sync transfers from last N days
    for await (const transfer of stripe.transfers.list(
      { limit: 100, created: { gte: since } },
      { stripeAccount: integration.stripeAccountId }
    )) {
      try {
        await handleTransferCreated(integration, transfer);
      } catch (err) {
        await db.insert(stripeSyncLog).values({
          integrationId,
          eventType: "transfer.created",
          stripeEventId: null,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          payload: { transferId: transfer.id },
        });
      }
    }

    // 5. Sync credit notes
    for await (const cn of stripe.creditNotes.list(
      { limit: 100 },
      { stripeAccount: integration.stripeAccountId }
    )) {
      try {
        await handleStripeCreditNoteCreated(integration, cn);
      } catch (err) {
        await db.insert(stripeSyncLog).values({
          integrationId,
          eventType: "credit_note.created",
          stripeEventId: null,
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          payload: { creditNoteId: cn.id },
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
