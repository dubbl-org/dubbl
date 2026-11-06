import { NextResponse } from "next/server";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { memberCapacity } from "@/lib/api/check-limit";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const { current, max, plan, status, canAdd, reason } = await memberCapacity(ctx.organizationId);

    return NextResponse.json({
      current,
      max: max === Infinity ? null : max,
      plan,
      status,
      canInvite: canAdd,
      reason,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
