import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectNote } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  content: z.string().min(1),
  isPinned: z.boolean().default(false),
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

    const notes = await db.query.projectNote.findMany({
      where: eq(projectNote.projectId, id),
      orderBy: desc(projectNote.createdAt),
      with: { author: true },
    });

    return NextResponse.json({ notes });
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
      .insert(projectNote)
      .values({
        projectId: id,
        authorId: ctx.userId,
        content: parsed.content,
        isPinned: parsed.isPinned,
      })
      .returning();

    // Fetch with author
    const note = await db.query.projectNote.findFirst({
      where: eq(projectNote.id, created.id),
      with: { author: true },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  content: z.string().min(1).optional(),
  isPinned: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId");
    if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

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

    const existing = await db.query.projectNote.findFirst({
      where: and(eq(projectNote.id, noteId), eq(projectNote.projectId, id)),
    });

    if (!existing) return notFound("Note");

    const [updated] = await db
      .update(projectNote)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(projectNote.id, noteId))
      .returning();

    const note = await db.query.projectNote.findFirst({
      where: eq(projectNote.id, updated.id),
      with: { author: true },
    });

    return NextResponse.json({ note });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId");
    if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    await db
      .delete(projectNote)
      .where(and(
        eq(projectNote.id, noteId),
        eq(projectNote.projectId, id)
      ));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
