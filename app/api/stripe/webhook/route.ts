import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
      const plan = session.metadata?.plan as "pro" | "business";

      if (orgId && plan && session.subscription) {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const existing = await db.query.subscription.findFirst({
          where: eq(subscription.organizationId, orgId),
        });

        const period = getItemPeriod(stripeSubscription);

        const data = {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: stripeSubscription.id,
          stripePriceId: stripeSubscription.items.data[0].price.id,
          plan,
          status: "active" as const,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          seatCount: stripeSubscription.items.data[0].quantity || 1,
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
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const period = getItemPeriod(sub);
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
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(subscription)
        .set({
          status: "canceled",
          plan: "free",
          updatedAt: new Date(),
        })
        .where(eq(subscription.stripeSubscriptionId, sub.id));
      break;
    }
  }

  return NextResponse.json({ received: true });
}
