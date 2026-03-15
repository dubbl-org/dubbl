import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const unsubscribeSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = unsubscribeSchema.parse(body);

    const existing = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, parsed.id),
        eq(webhook.organizationId, ctx.organizationId),
        notDeleted(webhook.deletedAt)
      ),
    });

    if (!existing) return notFound("Webhook");

    await db
      .update(webhook)
      .set(softDelete())
      .where(eq(webhook.id, parsed.id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "webhook",
      entityId: parsed.id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
