import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { periodLock } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const upsertSchema = z.object({
  lockDate: z.string().min(1),
  reason: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const found = await db.query.periodLock.findFirst({
      where: eq(periodLock.organizationId, ctx.organizationId),
    });

    return NextResponse.json({ periodLock: found || null });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:period-lock");

    const body = await request.json();
    const parsed = upsertSchema.parse(body);

    // Delete existing lock for org, then insert new one
    await db
      .delete(periodLock)
      .where(eq(periodLock.organizationId, ctx.organizationId));

    const [created] = await db
      .insert(periodLock)
      .values({
        organizationId: ctx.organizationId,
        lockDate: parsed.lockDate,
        lockedBy: ctx.userId,
        reason: parsed.reason || null,
      })
      .returning();

    return NextResponse.json({ periodLock: created });
  } catch (err) {
    return handleError(err);
  }
}
