import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscription, invoice, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

function getItemPeriod(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    start: item ? new Date(item.current_period_start * 1000) : new Date(),
    end: item ? new Date(item.current_period_end * 1000) : new Date(),
  };
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organizationId;
      const checkoutType = session.metadata?.type;

      if (orgId && checkoutType === "storage" && session.subscription) {
        // Storage add-on checkout
        const storagePlan = session.metadata?.storagePlan as "starter" | "growth" | "scale";
        const stripeSubscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const existing = await db.query.subscription.findFirst({
          where: eq(subscription.organizationId, orgId),
        });

        const storageData = {
          storagePlan,
          stripeStorageSubscriptionId: stripeSubscription.id,
          stripeStoragePriceId: stripeSubscription.items.data[0].price.id,
          stripeCustomerId: session.customer as string,
          updatedAt: new Date(),
        };

        if (existing) {
          await db
            .update(subscription)
            .set(storageData)
            .where(eq(subscription.id, existing.id));
        } else {
          await db.insert(subscription).values({
            organizationId: orgId,
            ...storageData,
          });
        }
      } else if (orgId && session.subscription) {
        // Seat plan checkout
        const plan = session.metadata?.plan as "pro";
        if (plan) {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const existing = await db.query.subscription.findFirst({
            where: eq(subscription.organizationId, orgId),
          });

          const period = getItemPeriod(stripeSubscription);

          const billingInterval = session.metadata?.interval === "annual" ? "annual" : "monthly";

          const data = {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: stripeSubscription.id,
            stripePriceId: stripeSubscription.items.data[0].price.id,
            plan,
            status: "active" as const,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            seatCount: stripeSubscription.items.data[0].quantity || 1,
            billingInterval,
            updatedAt: new Date(),
          };

          if (existing) {
            await db
              .update(subscription)
              .set(data)
              .where(eq(subscription.id, existing.id));
          } else {
            await db.insert(subscription).values({
              organizationId: orgId,
              ...data,
            });
          }
        }
      }

      // Handle invoice payments
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId && !session.metadata?.plan) {
        const inv = await db.query.invoice.findFirst({
          where: eq(invoice.id, invoiceId),
        });

        if (inv && inv.status !== "paid") {
          // Idempotency: skip if a payment already exists for this PI
          const piId = (session.payment_intent as string) || null;
          if (piId) {
            const existingPayment = await db.query.payment.findFirst({
              where: and(
                eq(payment.organizationId, inv.organizationId),
                eq(payment.stripePaymentIntentId, piId)
              ),
            });
            if (existingPayment) break;
          }

          const paymentNumber = `PMT-${Date.now().toString(36).toUpperCase()}`;

          const [newPayment] = await db
            .insert(payment)
            .values({
              organizationId: inv.organizationId,
              contactId: inv.contactId,
              paymentNumber,
              type: "received",
              date: new Date().toISOString().slice(0, 10),
              amount: inv.amountDue,
              method: "card",
              reference: `Stripe: ${session.payment_intent || session.id}`,
              currencyCode: inv.currencyCode,
              stripePaymentIntentId: piId,
            })
            .returning();

          await db.insert(paymentAllocation).values({
            paymentId: newPayment.id,
            documentType: "invoice",
            documentId: inv.id,
            amount: inv.amountDue,
          });

          await db
            .update(invoice)
            .set({
              amountPaid: inv.amountPaid + inv.amountDue,
              amountDue: 0,
              status: "paid",
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, inv.id));
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const period = getItemPeriod(sub);

      // Check if this is a storage subscription
      const storageMatch = await db.query.subscription.findFirst({
        where: eq(subscription.stripeStorageSubscriptionId, sub.id),
      });

      if (storageMatch) {
        if (sub.status === "active") {
          // Storage subscription updated (upgrade/downgrade) - update price ID
          await db
            .update(subscription)
            .set({
              stripeStoragePriceId: sub.items.data[0]?.price.id || null,
              updatedAt: new Date(),
            })
            .where(eq(subscription.id, storageMatch.id));
        } else if (sub.status === "canceled") {
          await db
            .update(subscription)
            .set({
              storagePlan: "free",
              stripeStorageSubscriptionId: null,
              stripeStoragePriceId: null,
              updatedAt: new Date(),
            })
            .where(eq(subscription.id, storageMatch.id));
        }
      } else {
        // Seat subscription update
        await db
          .update(subscription)
          .set({
            status: sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled",
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            seatCount: sub.items.data[0].quantity || 1,
            updatedAt: new Date(),
          })
          .where(eq(subscription.stripeSubscriptionId, sub.id));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      // Check if this is a storage subscription
      const storageMatch = await db.query.subscription.findFirst({
        where: eq(subscription.stripeStorageSubscriptionId, sub.id),
      });

      if (storageMatch) {
        await db
          .update(subscription)
          .set({
            storagePlan: "free",
            stripeStorageSubscriptionId: null,
            stripeStoragePriceId: null,
            updatedAt: new Date(),
          })
          .where(eq(subscription.id, storageMatch.id));
      } else {
        await db
          .update(subscription)
          .set({
            status: "canceled",
            plan: "free",
            updatedAt: new Date(),
          })
          .where(eq(subscription.stripeSubscriptionId, sub.id));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
