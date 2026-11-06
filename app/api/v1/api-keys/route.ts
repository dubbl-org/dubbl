import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKey, member, users } from "@/lib/db/schema";
import { eq, count, inArray } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { z } from "zod";
import { logAudit } from "@/lib/api/audit";
import { getOrgPlanLimits } from "@/lib/api/check-limit";

const MAX_API_KEYS = 20;

const createSchema = z.object({
  name: z.string().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function checkApiAccess(orgId: string): Promise<boolean> {
  const { limits } = await getOrgPlanLimits(orgId);
  return limits.apiAccess;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:api-keys");

    const hasAccess = await checkApiAccess(ctx.organizationId);

    const keys = await db.query.apiKey.findMany({
      where: eq(apiKey.organizationId, ctx.organizationId),
      orderBy: apiKey.createdAt,
    });

    // A key acts as its creator, so it stops working once they leave the org
    const [members, creators] = await Promise.all([
      db.query.member.findMany({
        where: eq(member.organizationId, ctx.organizationId),
        columns: { userId: true },
      }),
      keys.length
        ? db.query.users.findMany({
            where: inArray(users.id, [...new Set(keys.map((k) => k.createdBy))]),
            columns: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);
    const memberIds = new Set(members.map((m) => m.userId));
    const creatorById = new Map(creators.map((u) => [u.id, u]));

    return NextResponse.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        expiresAt: k.expiresAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
        createdByName:
          creatorById.get(k.createdBy)?.name || creatorById.get(k.createdBy)?.email || null,
        disabled: !memberIds.has(k.createdBy),
      })),
      apiAccess: hasAccess,
      maxKeys: MAX_API_KEYS,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:api-keys");

    // Check plan allows API access
    const hasAccess = await checkApiAccess(ctx.organizationId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Your plan doesn't include API access" },
        { status: 403 }
      );
    }

    // Check key count limit
    const [keyCount] = await db
      .select({ count: count() })
      .from(apiKey)
      .where(eq(apiKey.organizationId, ctx.organizationId));
    if (keyCount.count >= MAX_API_KEYS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_API_KEYS} API keys per organization` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Generate key: dk_live_ + nanoid(32)
    const rawKey = `dk_live_${nanoid(32)}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 12);

    const [key] = await db
      .insert(apiKey)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        keyHash,
        keyPrefix,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        createdBy: ctx.userId,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "api_key", entityId: key.id, request });

    return NextResponse.json(
      {
        key: {
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          createdAt: key.createdAt.toISOString(),
        },
        plainKey: rawKey,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
