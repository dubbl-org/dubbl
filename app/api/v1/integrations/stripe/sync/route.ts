import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { runInitialSync } from "@/lib/integrations/stripe/initial-sync";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");

    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.organizationId, ctx.organizationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration) return notFound("Stripe integration");

    // Fire-and-forget sync
    runInitialSync(integration.id).catch((err) => {
      console.error("Manual Stripe sync failed:", err);
    });

    return NextResponse.json({ success: true, message: "Sync started" });
  } catch (err) {
    return handleError(err);
  }
}
