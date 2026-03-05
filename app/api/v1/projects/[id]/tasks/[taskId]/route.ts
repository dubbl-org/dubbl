import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectTask } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

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
    requireRole(ctx, "manage:projects");

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    await db
      .delete(projectTask)
      .where(and(eq(projectTask.id, taskId), eq(projectTask.projectId, id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
