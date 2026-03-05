import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectTask, taskChecklist } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
});

const updateSchema = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  isCompleted: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const bulkUpdateSchema = z.object({
  items: z.array(updateSchema),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const items = await db.query.taskChecklist.findMany({
      where: eq(taskChecklist.taskId, taskId),
      orderBy: asc(taskChecklist.sortOrder),
    });

    return NextResponse.json({ items });
  } catch (err) { return handleError(err); }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const task = await db.query.projectTask.findFirst({
      where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, id)),
    });
    if (!task) return notFound("Task");

    const [created] = await db.insert(taskChecklist).values({
      taskId,
      title: parsed.title,
    }).returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) { return handleError(err); }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = bulkUpdateSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    for (const item of parsed.items) {
      const updates: Record<string, unknown> = {};
      if (item.title !== undefined) updates.title = item.title;
      if (item.isCompleted !== undefined) updates.isCompleted = item.isCompleted;
      if (item.sortOrder !== undefined) updates.sortOrder = item.sortOrder;
      if (Object.keys(updates).length > 0) {
        await db.update(taskChecklist).set(updates).where(eq(taskChecklist.id, item.id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    await db.delete(taskChecklist).where(eq(taskChecklist.id, itemId));
    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}
