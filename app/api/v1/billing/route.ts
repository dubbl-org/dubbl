import { NextResponse } from "next/server";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { getBillingSummary } from "@/lib/api/billing-summary";

/** The organization's plan, limits (null = unlimited) and usage. */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const billing = await getBillingSummary(ctx.organizationId);
    return NextResponse.json({ selfHosted: billing.selfHosted, billing });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
