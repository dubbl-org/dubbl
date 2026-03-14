import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { reconcileStripeBalance } from "@/lib/integrations/stripe/reconcile";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");

    const body = await request.json();
    const integrationId = body.integrationId;
    if (!integrationId) {
      return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
    }

    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.id, integrationId),
        eq(stripeIntegration.organizationId, ctx.organizationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration) return notFound("Stripe integration");

    const days = Math.min(Math.max(body.days ?? 30, 1), 90);

    const result = await reconcileStripeBalance(
      integration.id,
      ctx.organizationId,
      days
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}
