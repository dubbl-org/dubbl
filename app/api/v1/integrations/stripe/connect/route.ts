import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");

    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "Stripe Connect not configured" },
        { status: 500 }
      );
    }

    const reqUrl = new URL(request.url);
    const label = reqUrl.searchParams.get("label") || "Default";

    const nonce = crypto.randomBytes(16).toString("hex");
    const statePayload = JSON.stringify({
      orgId: ctx.organizationId,
      userId: ctx.userId,
      nonce,
      label,
    });
    const state = Buffer.from(statePayload).toString("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "read_write",
      state,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/integrations/stripe/callback`,
    });

    const url = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

    return NextResponse.json({ url });
  } catch (err) {
    return handleError(err);
  }
}
