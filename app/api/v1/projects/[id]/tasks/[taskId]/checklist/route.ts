import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectTask, taskChecklist } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound } from "@/lib/api/response";
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

/** True when the task belongs to the project (items are always scoped through it). */
async function taskInProject(projectId: string, taskId: string) {
  const task = await db.query.projectTask.findFirst({
    where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, projectId)),
    columns: { id: true },
  });
  return !!task;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "view");
    if (!(await taskInProject(id, taskId))) return notFound("Task");

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

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await requireProjectAccess(ctx, id, "contribute");
    if (!(await taskInProject(id, taskId))) return notFound("Task");

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
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = bulkUpdateSchema.parse(body);

    await requireProjectAccess(ctx, id, "contribute");
    if (!(await taskInProject(id, taskId))) return notFound("Task");

    for (const item of parsed.items) {
      const updates: Record<string, unknown> = {};
      if (item.title !== undefined) updates.title = item.title;
      if (item.isCompleted !== undefined) updates.isCompleted = item.isCompleted;
      if (item.sortOrder !== undefined) updates.sortOrder = item.sortOrder;
      if (Object.keys(updates).length > 0) {
        await db
          .update(taskChecklist)
          .set(updates)
          .where(and(eq(taskChecklist.id, item.id), eq(taskChecklist.taskId, taskId)));
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
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "contribute");
    if (!(await taskInProject(id, taskId))) return notFound("Task");

    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    await db
      .delete(taskChecklist)
      .where(and(eq(taskChecklist.id, itemId), eq(taskChecklist.taskId, taskId)));
    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}
