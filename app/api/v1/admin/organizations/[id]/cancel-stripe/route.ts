import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";
import Stripe from "stripe";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const { id } = await params;

    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, id),
    });

    if (!sub) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    // Cancel in Stripe if there's a subscription
    if (sub.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch {
        // Subscription may already be canceled in Stripe
      }
    }

    // Update local record
    await db
      .update(subscription)
      .set({
        status: "canceled",
        stripeSubscriptionId: null,
        stripePriceId: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscription.organizationId, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
