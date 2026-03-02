import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, ctx.organizationId),
    });

    return NextResponse.json({
      billing: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            seatCount: sub.seatCount,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : {
            plan: "free",
            status: "active",
            seatCount: 1,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
