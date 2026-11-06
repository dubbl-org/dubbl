import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { stripe } from "@/lib/stripe";
import { isPaidPlan } from "@/lib/stripe-prices";
import { BillingError, startPlanCheckout } from "@/lib/api/billing-checkout";

const checkoutSchema = z.object({
  plan: z.string().min(1),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

/** Start (or switch) the organization's plan subscription. */
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:billing");

    const { plan, interval } = checkoutSchema.parse(await request.json());
    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    return NextResponse.json(await startPlanCheckout(ctx.organizationId, plan, interval));
  } catch (err) {
    if (err instanceof AuthError || err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
