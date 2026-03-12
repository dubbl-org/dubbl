import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhook, webhookDelivery } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    // Verify webhook belongs to org
    const found = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, id),
        eq(webhook.organizationId, ctx.organizationId),
        notDeleted(webhook.deletedAt)
      ),
    });

    if (!found) return notFound("Webhook");

    const conditions = [eq(webhookDelivery.webhookId, id)];

    const deliveries = await db.query.webhookDelivery.findMany({
      where: and(...conditions),
      orderBy: desc(webhookDelivery.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(webhookDelivery)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        deliveries,
        Number(countResult?.count || 0),
        page,
        limit
      )
    );
  } catch (err) {
    return handleError(err);
  }
}
