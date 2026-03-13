import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

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

    return NextResponse.json(
      paginatedResponse(webhooks, Number(countResult?.count || 0), page, limit)
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

    return NextResponse.json({ webhook: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
