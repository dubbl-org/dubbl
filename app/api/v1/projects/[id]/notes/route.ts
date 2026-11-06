import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectNote } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { error, handleError, notFound } from "@/lib/api/response";
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

    await requireProjectAccess(ctx, id, "view");

    const notes = await db.query.projectNote.findMany({
      where: eq(projectNote.projectId, id),
      orderBy: desc(projectNote.createdAt),
      with: { author: { columns: { id: true, name: true, email: true, image: true } } },
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

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await requireProjectAccess(ctx, id, "contribute");

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
      with: { author: { columns: { id: true, name: true, email: true, image: true } } },
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

    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId");
    if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const { access } = await requireProjectAccess(ctx, id, "contribute");

    const existing = await db.query.projectNote.findFirst({
      where: and(eq(projectNote.id, noteId), eq(projectNote.projectId, id)),
    });

    if (!existing) return notFound("Note");
    // Anyone who contributes can pin; only the author or a manager can edit the text.
    if (parsed.content !== undefined && existing.authorId !== ctx.userId && access !== "manage") {
      return error("You can only edit your own notes", 403);
    }

    const [updated] = await db
      .update(projectNote)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(projectNote.id, noteId))
      .returning();

    const note = await db.query.projectNote.findFirst({
      where: eq(projectNote.id, updated.id),
      with: { author: { columns: { id: true, name: true, email: true, image: true } } },
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

    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId");
    if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

    const { access } = await requireProjectAccess(ctx, id, "contribute");

    const existing = await db.query.projectNote.findFirst({
      where: and(eq(projectNote.id, noteId), eq(projectNote.projectId, id)),
      columns: { authorId: true },
    });
    if (!existing) return notFound("Note");
    if (existing.authorId !== ctx.userId && access !== "manage") {
      return error("You can only delete your own notes", 403);
    }

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
