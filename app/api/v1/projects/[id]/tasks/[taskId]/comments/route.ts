import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectTask, taskComment } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

const createSchema = z.object({
  content: z.string().min(1),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "view");
    const task = await db.query.projectTask.findFirst({
      where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, id)),
      columns: { id: true },
    });
    if (!task) return notFound("Task");

    const comments = await db.query.taskComment.findMany({
      where: eq(taskComment.taskId, taskId),
      orderBy: desc(taskComment.createdAt),
      with: { author: { columns: { id: true, name: true, email: true, image: true } } },
    });

    return NextResponse.json({ comments });
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

    const task = await db.query.projectTask.findFirst({
      where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, id)),
    });
    if (!task) return notFound("Task");

    const [created] = await db.insert(taskComment).values({
      taskId,
      authorId: ctx.userId,
      content: parsed.content,
    }).returning();

    return NextResponse.json({ comment: created }, { status: 201 });
  } catch (err) { return handleError(err); }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const ctx = await getAuthContext(request);

    const { access } = await requireProjectAccess(ctx, id, "contribute");

    const url = new URL(request.url);
    const commentId = url.searchParams.get("commentId");
    if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

    // Only the author, or a project manager, can delete a comment.
    const comment = await db.query.taskComment.findFirst({
      where: and(eq(taskComment.id, commentId), eq(taskComment.taskId, taskId)),
    });
    if (!comment) return notFound("Comment");
    const task = await db.query.projectTask.findFirst({
      where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, id)),
      columns: { id: true },
    });
    if (!task) return notFound("Task");
    if (comment.authorId !== ctx.userId && access !== "manage") {
      return NextResponse.json({ error: "Can only delete your own comments" }, { status: 403 });
    }

    await db.delete(taskComment).where(eq(taskComment.id, commentId));
    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}
