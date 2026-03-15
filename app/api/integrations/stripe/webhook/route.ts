import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { processStripeEvent } from "@/lib/integrations/stripe/sync";

/**
 * Platform-level Connect webhook handler.
 *
 * This uses a SINGLE webhook endpoint registered on the platform's own Stripe
 * account (not on connected accounts). Stripe forwards Connect events here
 * with the `stripe-account` header identifying which connected account the
 * event belongs to.
 *
 * Why this is better than per-account webhooks:
 * - Users can't delete or tamper with the webhook from their Stripe dashboard
 * - Deauthorization events are always delivered (they go to the platform)
 * - Single secret to manage via STRIPE_CONNECT_WEBHOOK_SECRET env var
 */
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!connectWebhookSecret) {
    console.error("STRIPE_CONNECT_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 }
    );
  }

  // Verify signature using platform-level Connect webhook secret
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, connectWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // For Connect events, the account is in the event object
  const stripeAccountId = event.account;
  if (!stripeAccountId) {
    // Not a Connect event, ignore
    return NextResponse.json({ received: true, skipped: true });
  }

  // Look up integration by stripe account ID
  const integration = await db.query.stripeIntegration.findFirst({
    where: and(
      eq(stripeIntegration.stripeAccountId, stripeAccountId),
      notDeleted(stripeIntegration.deletedAt)
    ),
  });

  // Handle deauthorization even if integration is already soft-deleted
  if (event.type === "account.application.deauthorized") {
    const anyIntegration = await db.query.stripeIntegration.findFirst({
      where: eq(stripeIntegration.stripeAccountId, stripeAccountId),
    });
    if (anyIntegration && !anyIntegration.deletedAt) {
      await db
        .update(stripeIntegration)
        .set({
          status: "disconnected",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stripeIntegration.id, anyIntegration.id));

      await db.insert(stripeSyncLog).values({
        integrationId: anyIntegration.id,
        eventType: event.type,
        stripeEventId: event.id,
        status: "success",
        payload: { eventId: event.id, type: event.type },
      });
    }
    return NextResponse.json({ received: true });
  }

  if (!integration) {
    // Unknown account or already disconnected, acknowledge but skip
    return NextResponse.json({ received: true, skipped: true });
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
    const result = await processStripeEvent(event, integration);
    if (result.action === "skipped") {
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
