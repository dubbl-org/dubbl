import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectTask, taskComment } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
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

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const comments = await db.query.taskComment.findMany({
      where: eq(taskComment.taskId, taskId),
      orderBy: desc(taskComment.createdAt),
      with: { author: true },
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

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

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
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const url = new URL(request.url);
    const commentId = url.searchParams.get("commentId");
    if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

    // Only allow deleting own comments (or admin)
    const comment = await db.query.taskComment.findFirst({
      where: eq(taskComment.id, commentId),
    });
    if (!comment) return notFound("Comment");
    if (comment.authorId !== ctx.userId) {
      return NextResponse.json({ error: "Can only delete your own comments" }, { status: 403 });
    }

    await db.delete(taskComment).where(eq(taskComment.id, commentId));
    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}
