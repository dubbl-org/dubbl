import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { processDueScheduledPayments } from "@/lib/api/bill-payment";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    // Pays every due pending scheduled payment from its chosen bank account,
    // one transaction each; failures are marked failed with the reason.
    const result = await processDueScheduledPayments(ctx);

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
