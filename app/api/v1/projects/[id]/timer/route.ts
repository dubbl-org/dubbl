import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, runningTimer } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

// GET - fetch current user's running timer for this project
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const timer = await db.query.runningTimer.findFirst({
      where: and(
        eq(runningTimer.projectId, id),
        eq(runningTimer.userId, ctx.userId),
      ),
      with: { task: true },
    });

    return NextResponse.json({ timer: timer || null });
  } catch (err) {
    return handleError(err);
  }
}

const startSchema = z.object({
  isBillable: z.boolean().default(true),
  taskId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

// POST - start a new timer
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });
    if (!proj) return notFound("Project");

    // Delete any existing timer for this user+project
    await db
      .delete(runningTimer)
      .where(and(
        eq(runningTimer.projectId, id),
        eq(runningTimer.userId, ctx.userId),
      ));

    const body = await request.json();
    const parsed = startSchema.parse(body);

    const [created] = await db
      .insert(runningTimer)
      .values({
        projectId: id,
        userId: ctx.userId,
        startedAt: new Date(),
        description: parsed.description || null,
        taskId: parsed.taskId || null,
        isBillable: parsed.isBillable,
      })
      .returning();

    return NextResponse.json({ timer: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  description: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  isBillable: z.boolean().optional(),
  pausedAt: z.string().nullable().optional(),
  accumulatedSeconds: z.number().int().min(0).optional(),
});

// PATCH - update running timer (description, pause/resume, etc.)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const existing = await db.query.runningTimer.findFirst({
      where: and(
        eq(runningTimer.projectId, id),
        eq(runningTimer.userId, ctx.userId),
      ),
    });
    if (!existing) return notFound("Timer");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const updates: Record<string, unknown> = {};
    if (parsed.description !== undefined) updates.description = parsed.description;
    if (parsed.taskId !== undefined) updates.taskId = parsed.taskId || null;
    if (parsed.isBillable !== undefined) updates.isBillable = parsed.isBillable;
    if (parsed.accumulatedSeconds !== undefined) updates.accumulatedSeconds = parsed.accumulatedSeconds;
    if (parsed.pausedAt !== undefined) {
      updates.pausedAt = parsed.pausedAt ? new Date(parsed.pausedAt) : null;
      // When resuming (pausedAt = null), update startedAt so elapsed calc works
      if (!parsed.pausedAt) {
        updates.startedAt = new Date();
      }
    }

    const [updated] = await db
      .update(runningTimer)
      .set(updates)
      .where(eq(runningTimer.id, existing.id))
      .returning();

    return NextResponse.json({ timer: updated });
  } catch (err) {
    return handleError(err);
  }
}

// DELETE - discard/stop the timer without saving
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    await db
      .delete(runningTimer)
      .where(and(
        eq(runningTimer.projectId, id),
        eq(runningTimer.userId, ctx.userId),
      ));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
