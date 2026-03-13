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

    let priceId: string;
    let metadata: Record<string, string>;

    if (type === "storage") {
      const storagePriceMap: Record<string, string | undefined> = {
        starter: process.env.STRIPE_STORAGE_STARTER_PRICE_ID,
        growth: process.env.STRIPE_STORAGE_GROWTH_PRICE_ID,
        scale: process.env.STRIPE_STORAGE_SCALE_PRICE_ID,
      };
      const storagePriceId = storagePriceMap[plan];
      if (!storagePriceId) {
        return NextResponse.json({ error: "Invalid storage plan" }, { status: 400 });
      }
      priceId = storagePriceId;
      metadata = {
        organizationId: ctx.organizationId,
        type: "storage",
        storagePlan: plan,
      };
    } else {
      if (plan !== "pro" && plan !== "business") {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
      if (plan === "pro") {
        priceId = interval === "annual"
          ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID!
          : process.env.STRIPE_PRO_PRICE_ID!;
      } else {
        priceId = process.env.STRIPE_BUSINESS_PRICE_ID!;
      }
      metadata = {
        organizationId: ctx.organizationId,
        type: "seats",
        plan,
        interval,
      };
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
      metadata,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
