import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectTask } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigneeId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  labels: z.array(z.string()).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const tasks = await db.query.projectTask.findMany({
      where: eq(projectTask.projectId, id),
      orderBy: asc(projectTask.sortOrder),
      with: {
        assignee: {
          with: { user: true },
        },
      },
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const [created] = await db
      .insert(projectTask)
      .values({
        projectId: id,
        title: parsed.title,
        description: parsed.description || null,
        status: parsed.status,
        priority: parsed.priority,
        assigneeId: parsed.assigneeId || null,
        teamId: parsed.teamId || null,
        createdById: ctx.userId,
        startDate: parsed.startDate || null,
        dueDate: parsed.dueDate || null,
        estimatedMinutes: parsed.estimatedMinutes || null,
        labels: parsed.labels || [],
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "project_task", entityId: created.id, request });

    return NextResponse.json({ task: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
