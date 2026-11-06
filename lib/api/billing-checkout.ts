import { db } from "@/lib/db";
import { subscription, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { planPriceId, type BillingInterval } from "@/lib/stripe-prices";
import { PLAN_INFO, type PaidPlanName } from "@/lib/plans";

export class BillingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "BillingError";
  }
}

/** The organization's Stripe customer, created on first use. */
export async function ensureStripeCustomer(orgId: string) {
  if (!stripe) throw new BillingError("Billing isn't configured on this deployment", 404);

  const [org, sub] = await Promise.all([
    db.query.organization.findFirst({ where: eq(organization.id, orgId) }),
    db.query.subscription.findFirst({ where: eq(subscription.organizationId, orgId) }),
  ]);
  if (!org) throw new BillingError("Organization not found", 404);

  if (sub?.stripeCustomerId) return { customerId: sub.stripeCustomerId, sub };
  const customer = await stripe.customers.create({ name: org.name, metadata: { organizationId: orgId } });
  return { customerId: customer.id, sub };
}

/**
 * Move the organization to a paid plan. An existing plan subscription is
 * switched to the new price straight away (prorated) and `{ updated: true }`
 * comes back; otherwise a Stripe Checkout URL is returned for the customer.
 */
export async function startPlanCheckout(
  orgId: string,
  plan: PaidPlanName,
  interval: BillingInterval
): Promise<{ url: string } | { updated: true }> {
  if (!stripe) throw new BillingError("Billing isn't configured on this deployment", 404);

  const priceId = planPriceId(plan, interval);
  if (!priceId) throw new BillingError(`The ${PLAN_INFO[plan].name} plan isn't available for purchase yet`);

  const { customerId, sub } = await ensureStripeCustomer(orgId);
  if (sub?.managedBy === "manual") {
    throw new BillingError("This organization's plan is managed by the dubbl team. Contact support to change it.", 409);
  }

  const metadata = { organizationId: orgId, type: "seats", plan, interval };

  if (sub?.stripeSubscriptionId && (sub.status === "active" || sub.status === "trialing")) {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = stripeSub.items.data[0];
    if (item) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: item.id, price: priceId, quantity: 1 }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
        metadata,
      });
      await db
        .update(subscription)
        .set({
          plan,
          stripePriceId: priceId,
          billingInterval: interval,
          seatCount: 1,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscription.id, sub.id));
      return { updated: true };
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    automatic_tax: { enabled: true },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    metadata,
  });
  if (!session.url) throw new BillingError("Stripe didn't return a checkout URL", 502);
  return { url: session.url };
}
