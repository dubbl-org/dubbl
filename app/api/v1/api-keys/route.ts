import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKey } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:api-keys");

    const keys = await db.query.apiKey.findMany({
      where: eq(apiKey.organizationId, ctx.organizationId),
      orderBy: apiKey.createdAt,
    });

    return NextResponse.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        expiresAt: k.expiresAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      })),
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
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
