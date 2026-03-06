import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectMilestone } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["upcoming", "in_progress", "completed", "overdue"]).optional(),
  dueDate: z.string().nullable().optional(),
  amount: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
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

    const existing = await db.query.projectMilestone.findFirst({
      where: and(
        eq(projectMilestone.id, milestoneId),
        eq(projectMilestone.projectId, id)
      ),
    });

    if (!existing) return notFound("Milestone");

    const setData: Record<string, unknown> = { ...parsed };
    if (parsed.status === "completed" && existing.status !== "completed") {
      setData.completedAt = new Date();
    }

    const [updated] = await db
      .update(projectMilestone)
      .set(setData)
      .where(eq(projectMilestone.id, milestoneId))
      .returning();

    return NextResponse.json({ milestone: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
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
      .delete(projectMilestone)
      .where(and(
        eq(projectMilestone.id, milestoneId),
        eq(projectMilestone.projectId, id)
      ));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
