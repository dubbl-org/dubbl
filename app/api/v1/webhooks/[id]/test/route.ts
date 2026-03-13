import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { deliverWebhook } from "@/lib/webhooks/deliver";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:webhooks");

    const found = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, id),
        eq(webhook.organizationId, ctx.organizationId),
        notDeleted(webhook.deletedAt)
      ),
    });

    if (!found) return notFound("Webhook");

    const testPayload = {
      event: "test",
      data: {
        message: "This is a test webhook delivery from dubbl",
        webhookId: found.id,
        timestamp: new Date().toISOString(),
      },
    };

    const delivery = await deliverWebhook(found.id, "test", testPayload);

    return NextResponse.json({ delivery });
  } catch (err) {
    return handleError(err);
  }
}
