import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { eq, and } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");

    const body = await request.json().catch(() => ({}));
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

    // Deauthorize the connected account
    try {
      await stripe.oauth.deauthorize({
        client_id: process.env.STRIPE_CONNECT_CLIENT_ID!,
        stripe_user_id: integration.stripeAccountId,
      });
    } catch (err) {
      console.error("Failed to deauthorize Stripe account:", err);
    }

    // Soft-delete the integration
    await db
      .update(stripeIntegration)
      .set({
        ...softDelete(),
        status: "disconnected",
        updatedAt: new Date(),
      })
      .where(eq(stripeIntegration.id, integration.id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "stripe_integration",
      entityId: integration.id,
      changes: integration as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
