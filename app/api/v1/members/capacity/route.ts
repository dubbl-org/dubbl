import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { subscription } from "@/lib/db/schema/billing";
import { eq, count } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { getEffectiveLimits } from "@/lib/plans";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const [memberCountResult] = await db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, ctx.organizationId));

    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, ctx.organizationId),
    });

    const limits = getEffectiveLimits(sub ?? null);
    const current = memberCountResult.count;
    const max = limits.members;
    const plan = sub?.plan ?? "free";
    const status = sub?.status ?? "active";
    const seatCount = sub?.seatCount ?? 1;

    const isBillingOk = status === "active" || status === "trialing";
    const canInvite = isBillingOk && current < max;

    let reason: string | null = null;
    if (!isBillingOk) {
      reason = "Your billing is past due. Update your payment method to invite members.";
    } else if (current >= max) {
      if (plan === "free") {
        reason = "Free plan is limited to 1 member. Upgrade to Pro to invite your team.";
      } else {
        reason = `You've reached your plan's limit of ${max} members. Upgrade your plan or contact support.`;
      }
    }

    return NextResponse.json({
      current,
      max: max === Infinity ? null : max,
      plan,
      seatCount,
      status,
      canInvite,
      reason,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
