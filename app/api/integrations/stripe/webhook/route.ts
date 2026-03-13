import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  handleChargeSucceeded,
  handleChargeRefunded,
  handlePayoutPaid,
  handleCustomerCreated,
  handleCustomerUpdated,
} from "@/lib/integrations/stripe/sync";

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");
  const stripeAccountHeader = headersList.get("stripe-account");

  if (!sig || !stripeAccountHeader) {
    return NextResponse.json(
      { error: "Missing signature or account header" },
      { status: 400 }
    );
  }

  // Look up integration by stripe account ID
  const integration = await db.query.stripeIntegration.findFirst({
    where: and(
      eq(stripeIntegration.stripeAccountId, stripeAccountHeader),
      notDeleted(stripeIntegration.deletedAt)
    ),
  });

  if (!integration || !integration.webhookSecret) {
    return NextResponse.json(
      { error: "Integration not found" },
      { status: 404 }
    );
  }

  // Verify signature using per-integration webhook secret
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(integration.accessToken, { typescript: true });
    event = stripe.webhooks.constructEvent(body, sig, integration.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: check if we've already processed this event
  if (event.id) {
    const existing = await db.query.stripeSyncLog.findFirst({
      where: and(
        eq(stripeSyncLog.integrationId, integration.id),
        eq(stripeSyncLog.stripeEventId, event.id)
      ),
    });
    if (existing) {
      return NextResponse.json({ received: true, skipped: true });
    }
  }

  let status: "success" | "failed" | "skipped" = "success";
  let errorMessage: string | null = null;

  try {
    switch (event.type) {
      case "charge.succeeded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeSucceeded(integration, charge);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(integration, charge);
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        await handlePayoutPaid(integration, payout);
        break;
      }
      case "payout.failed": {
        // Log the failure but don't create entries
        status = "skipped";
        break;
      }
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        await handleCustomerCreated(integration, customer);
        break;
      }
      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        await handleCustomerUpdated(integration, customer);
        break;
      }
      case "account.application.deauthorized": {
        // Mark integration as disconnected
        await db
          .update(stripeIntegration)
          .set({
            status: "disconnected",
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(stripeIntegration.id, integration.id));
        break;
      }
      default:
        status = "skipped";
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Stripe webhook error [${event.type}]:`, err);
  }

  // Log to sync log
  await db.insert(stripeSyncLog).values({
    integrationId: integration.id,
    eventType: event.type,
    stripeEventId: event.id,
    status,
    errorMessage,
    payload: { eventId: event.id, type: event.type },
  });

  // Always return 200 after signature verification
  return NextResponse.json({ received: true });
}
