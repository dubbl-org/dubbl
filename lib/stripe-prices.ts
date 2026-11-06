import { PAID_PLANS, type PaidPlanName } from "@/lib/plans";

export type BillingInterval = "monthly" | "annual";

/**
 * Stripe price IDs for each paid plan. Standard falls back to the legacy
 * STRIPE_PRO_* variables so existing deployments keep working.
 */
function planPriceIds(): Record<PaidPlanName, Record<BillingInterval, string | undefined>> {
  const env = process.env;
  return {
    standard: {
      monthly: env.STRIPE_STANDARD_PRICE_ID || env.STRIPE_PRO_PRICE_ID,
      annual: env.STRIPE_STANDARD_ANNUAL_PRICE_ID || env.STRIPE_PRO_ANNUAL_PRICE_ID,
    },
    premium: {
      monthly: env.STRIPE_PREMIUM_PRICE_ID,
      annual: env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
    },
    ultimate: {
      monthly: env.STRIPE_ULTIMATE_PRICE_ID,
      annual: env.STRIPE_ULTIMATE_ANNUAL_PRICE_ID,
    },
  };
}

export function planPriceId(plan: PaidPlanName, interval: BillingInterval): string | undefined {
  return planPriceIds()[plan][interval];
}

/** The plan and interval a Stripe price belongs to, or null if it isn't a plan price. */
export function planFromPriceId(priceId: string | null | undefined): { plan: PaidPlanName; interval: BillingInterval } | null {
  if (!priceId) return null;
  const ids = planPriceIds();
  for (const plan of PAID_PLANS) {
    if (ids[plan].monthly === priceId) return { plan, interval: "monthly" };
    if (ids[plan].annual === priceId) return { plan, interval: "annual" };
  }
  return null;
}

export function isPaidPlan(plan: string): plan is PaidPlanName {
  return (PAID_PLANS as readonly string[]).includes(plan);
}
