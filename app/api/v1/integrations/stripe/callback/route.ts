import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { suggestStripeAccounts } from "@/lib/integrations/stripe/accounts";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=${errorParam}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=missing_params`
      );
    }

    // Decode state
    let stateData: { orgId: string; userId: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=invalid_state`
      );
    }

    // Exchange code for access token
    const response = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    if (!response.stripe_user_id || !response.access_token) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=oauth_failed`
      );
    }

    // Check for existing active integration
    const existing = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.organizationId, stateData.orgId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (existing) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=already_connected`
      );
    }

    // Suggest default account mappings (user can change in settings)
    const suggestions = await suggestStripeAccounts(stateData.orgId);

    // Register webhook on connected account
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/stripe/webhook`;
    const webhookEndpoint = await stripe.webhookEndpoints.create(
      {
        url: webhookUrl,
        enabled_events: [
          "charge.succeeded",
          "charge.refunded",
          "payout.paid",
          "payout.failed",
          "customer.created",
          "customer.updated",
          "account.application.deauthorized",
        ],
      },
      { stripeAccount: response.stripe_user_id }
    );

    // Insert integration record
    const [integration] = await db
      .insert(stripeIntegration)
      .values({
        organizationId: stateData.orgId,
        stripeAccountId: response.stripe_user_id,
        accessToken: response.access_token,
        refreshToken: response.refresh_token ?? null,
        livemode: response.livemode ?? false,
        scope: response.scope ?? null,
        webhookEndpointId: webhookEndpoint.id,
        webhookSecret: webhookEndpoint.secret ?? null,
        status: "active",
        clearingAccountId: suggestions.clearingAccountId,
        revenueAccountId: suggestions.revenueAccountId,
        feesAccountId: suggestions.feesAccountId,
        connectedBy: stateData.userId,
      })
      .returning();

    // Don't start initial sync automatically - user should confirm account
    // mappings in settings first, then trigger sync manually.

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?connected=true`
    );
  } catch (err) {
    console.error("Stripe OAuth callback error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=server_error`
    );
  }
}
