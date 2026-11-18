import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { assertPublicHttpsUrl } from "@/lib/api/url-guard";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";
import { logAudit } from "@/lib/api/audit";

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(webhook.organizationId, ctx.organizationId),
      notDeleted(webhook.deletedAt),
    ];

    const webhooks = await db.query.webhook.findMany({
      where: and(...conditions),
      orderBy: desc(webhook.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(webhook)
      .where(and(...conditions));

    // The signing secret is the only integrity control on deliveries: a
    // read-only member who can read it can forge events into the receiver.
    // It is shown once, at creation, and never listed.
    return NextResponse.json(
      paginatedResponse(
        webhooks.map(({ secret: _secret, ...wh }) => wh),
        Number(countResult?.count || 0),
        page,
        limit
      )
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:webhooks");

    const body = await request.json();
    const parsed = createSchema.parse(body);
    // User-chosen target: must be a public https endpoint, or this becomes an
    // internal port scanner with a response body returned to the caller.
    await assertPublicHttpsUrl(parsed.url);

    const secret = crypto.randomBytes(32).toString("hex");

    const [created] = await db
      .insert(webhook)
      .values({
        organizationId: ctx.organizationId,
        url: parsed.url,
        events: parsed.events,
        secret,
        description: parsed.description || null,
        isActive: parsed.isActive,
        metadata: parsed.metadata || null,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "webhook", entityId: created.id, request });

    return NextResponse.json({ webhook: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
