import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscription, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  type: z.enum(["seats", "storage"]).default("seats"),
  plan: z.string().min(1),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:billing");

    const body = await request.json();
    const { type, plan, interval } = checkoutSchema.parse(body);

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Get or create stripe customer
    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, ctx.organizationId),
    });

    let customerId = sub?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organizationId: ctx.organizationId },
      });
      customerId = customer.id;
    }

    if (type === "storage") {
      return handleStorageCheckout(sub, customerId, ctx.organizationId, plan, interval);
    } else {
      return handleSeatCheckout(sub, customerId, ctx.organizationId, plan, interval);
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleSeatCheckout(
  sub: typeof subscription.$inferSelect | undefined,
  customerId: string,
  organizationId: string,
  plan: string,
  interval: string
) {
  if (plan !== "pro" && plan !== "business") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  let priceId: string;
  if (plan === "pro") {
    priceId = interval === "annual"
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID!
      : process.env.STRIPE_PRO_PRICE_ID!;
  } else {
    priceId = interval === "annual"
      ? process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID!
      : process.env.STRIPE_BUSINESS_PRICE_ID!;
  }

  // If already has an active seat subscription, update it instead of creating new
  if (sub?.stripeSubscriptionId && sub.status === "active") {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const currentItem = stripeSub.items.data[0];

    if (currentItem) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: currentItem.id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { organizationId, type: "seats", plan, interval },
      });

      // Update local DB
      await db
        .update(subscription)
        .set({
          plan: plan as "pro" | "business",
          stripePriceId: priceId,
          billingInterval: interval,
          updatedAt: new Date(),
        })
        .where(eq(subscription.id, sub.id));

      return NextResponse.json({ updated: true });
    }
  }

  // New subscription - create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    metadata: { organizationId, type: "seats", plan, interval },
  });

  return NextResponse.json({ url: session.url });
}

async function handleStorageCheckout(
  sub: typeof subscription.$inferSelect | undefined,
  customerId: string,
  organizationId: string,
  plan: string,
  interval: string
) {
  const storagePriceMap: Record<string, Record<string, string | undefined>> = {
    starter: {
      monthly: process.env.STRIPE_STORAGE_STARTER_PRICE_ID,
      annual: process.env.STRIPE_STORAGE_STARTER_ANNUAL_PRICE_ID,
    },
    growth: {
      monthly: process.env.STRIPE_STORAGE_GROWTH_PRICE_ID,
      annual: process.env.STRIPE_STORAGE_GROWTH_ANNUAL_PRICE_ID,
    },
    scale: {
      monthly: process.env.STRIPE_STORAGE_SCALE_PRICE_ID,
      annual: process.env.STRIPE_STORAGE_SCALE_ANNUAL_PRICE_ID,
    },
  };

  const storagePriceId = storagePriceMap[plan]?.[interval];
  if (!storagePriceId) {
    return NextResponse.json({ error: "Invalid storage plan" }, { status: 400 });
  }

  // If already has an active storage subscription, update it
  if (sub?.stripeStorageSubscriptionId) {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeStorageSubscriptionId);
    const currentItem = stripeSub.items.data[0];

    if (currentItem && stripeSub.status === "active") {
      await stripe.subscriptions.update(sub.stripeStorageSubscriptionId, {
        items: [{ id: currentItem.id, price: storagePriceId }],
        proration_behavior: "create_prorations",
        metadata: { organizationId, type: "storage", storagePlan: plan, interval },
      });

      // Update local DB
      await db
        .update(subscription)
        .set({
          storagePlan: plan as "starter" | "growth" | "scale",
          stripeStoragePriceId: storagePriceId,
          updatedAt: new Date(),
        })
        .where(eq(subscription.id, sub.id));

      return NextResponse.json({ updated: true });
    }
  }

  // New storage subscription - create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: storagePriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    metadata: { organizationId, type: "storage", storagePlan: plan, interval },
  });

  return NextResponse.json({ url: session.url });
}
