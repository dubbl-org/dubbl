import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { suggestStripeAccounts } from "@/lib/integrations/stripe/accounts";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

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
    let stateData: { orgId: string; userId: string; nonce: string; label?: string };
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

    // Fetch business display name from Stripe
    const account = await stripe.accounts.retrieve(response.stripe_user_id);
    const displayName = account.business_profile?.name
      || account.settings?.dashboard?.display_name
      || null;

    // Check if this specific Stripe account is already connected
    const existingAccount = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.stripeAccountId, response.stripe_user_id),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (existingAccount) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations/stripe?error=account_already_connected`
      );
    }

    // Suggest default account mappings (user can change in settings)
    const suggestions = await suggestStripeAccounts(stateData.orgId);

    // No per-account webhook needed. We use a single platform-level Connect
    // webhook (STRIPE_CONNECT_WEBHOOK_SECRET) that receives events from all
    // connected accounts. This can't be deleted by the connected user.

    // Insert integration record
    await db
      .insert(stripeIntegration)
      .values({
        organizationId: stateData.orgId,
        stripeAccountId: response.stripe_user_id,
        label: stateData.label || "Default",
        displayName,
        accessToken: response.access_token,
        refreshToken: response.refresh_token ?? null,
        livemode: response.livemode ?? false,
        scope: response.scope ?? null,
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
