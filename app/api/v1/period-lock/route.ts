import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { periodLock } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const upsertSchema = z.object({
  lockDate: z.string().min(1),
  // Stricter advisor/hard lock. Staff are blocked at lockDate; callers holding
  // bypass:period-lock are only blocked at advisorLockDate. Null/omitted means
  // advisors are governed by lockDate too.
  advisorLockDate: z.string().min(1).nullable().optional(),
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
        advisorLockDate: parsed.advisorLockDate ?? null,
        lockedBy: ctx.userId,
        reason: parsed.reason || null,
      })
      .returning();

    logAudit({ ctx, action: "update", entityType: "period_lock", entityId: ctx.organizationId, changes: { lockDate: parsed.lockDate, advisorLockDate: parsed.advisorLockDate ?? null }, request });

    return NextResponse.json({ periodLock: created });
  } catch (err) {
    return handleError(err);
  }
}
