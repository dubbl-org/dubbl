import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectTask, runningTimer, timeEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";
import { notifyTaskAssigned, notifySafely } from "@/lib/notifications/events";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  labels: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const { project: proj } = await requireProjectAccess(ctx, id, "contribute");

    const existing = await db.query.projectTask.findFirst({
      where: and(
        eq(projectTask.id, taskId),
        eq(projectTask.projectId, id)
      ),
    });

    if (!existing) return notFound("Task");

    const updates: Record<string, unknown> = { ...parsed, updatedAt: new Date() };

    if (parsed.status === "done" && existing.status !== "done") {
      updates.completedAt = new Date();
    } else if (parsed.status && parsed.status !== "done") {
      updates.completedAt = null;
    }

    const [updated] = await db
      .update(projectTask)
      .set(updates)
      .where(eq(projectTask.id, taskId))
      .returning();

    if (updated.assigneeId && updated.assigneeId !== existing.assigneeId) {
      await notifySafely(notifyTaskAssigned(ctx.organizationId, updated, proj.name, ctx.userId));
    }

    return NextResponse.json({ task: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "manage");

    const existing = await db.query.projectTask.findFirst({
      where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, id)),
      columns: { id: true },
    });
    if (!existing) return notFound("Task");

    // Logged time and running timers keep their hours; they just lose the task link.
    await db.transaction(async (tx) => {
      await tx.update(timeEntry).set({ taskId: null }).where(eq(timeEntry.taskId, taskId));
      await tx.update(runningTimer).set({ taskId: null }).where(eq(runningTimer.taskId, taskId));
      await tx.delete(projectTask).where(eq(projectTask.id, taskId));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
