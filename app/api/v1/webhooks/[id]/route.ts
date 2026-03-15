import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, id),
        eq(webhook.organizationId, ctx.organizationId),
        notDeleted(webhook.deletedAt)
      ),
    });

    if (!found) return notFound("Webhook");
    return NextResponse.json({ webhook: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:webhooks");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, id),
        eq(webhook.organizationId, ctx.organizationId),
        notDeleted(webhook.deletedAt)
      ),
    });

    if (!existing) return notFound("Webhook");

    const [updated] = await db
      .update(webhook)
      .set(parsed)
      .where(eq(webhook.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "webhook", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ webhook: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:webhooks");

    const existing = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, id),
        eq(webhook.organizationId, ctx.organizationId),
        notDeleted(webhook.deletedAt)
      ),
    });

    if (!existing) return notFound("Webhook");

    await db
      .update(webhook)
      .set(softDelete())
      .where(eq(webhook.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "webhook",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
