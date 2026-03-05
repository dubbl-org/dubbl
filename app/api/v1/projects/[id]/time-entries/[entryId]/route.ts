import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, timeEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  minutes: z.number().int().min(1).optional(),
  isBillable: z.boolean().optional(),
  hourlyRate: z.number().int().min(0).optional(),
  taskId: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const ctx = await getAuthContext(request);

    // Verify project belongs to org
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const entry = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, entryId),
        eq(timeEntry.projectId, id)
      ),
      with: { user: true },
    });

    if (!entry) return notFound("Time entry");
    return NextResponse.json({ timeEntry: entry });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // Verify project belongs to org
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const existing = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, entryId),
        eq(timeEntry.projectId, id)
      ),
    });

    if (!existing) return notFound("Time entry");

    const [updated] = await db
      .update(timeEntry)
      .set(parsed)
      .where(eq(timeEntry.id, entryId))
      .returning();

    // Update project total hours if minutes changed
    if (parsed.minutes && parsed.minutes !== existing.minutes) {
      const diff = parsed.minutes - existing.minutes;
      await db
        .update(project)
        .set({
          totalHours: proj.totalHours + diff,
          updatedAt: new Date(),
        })
        .where(eq(project.id, id));
    }

    return NextResponse.json({ timeEntry: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    // Verify project belongs to org
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const existing = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, entryId),
        eq(timeEntry.projectId, id)
      ),
    });

    if (!existing) return notFound("Time entry");

    await db.delete(timeEntry).where(eq(timeEntry.id, entryId));

    // Update project total hours
    await db
      .update(project)
      .set({
        totalHours: proj.totalHours - existing.minutes,
        updatedAt: new Date(),
      })
      .where(eq(project.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
