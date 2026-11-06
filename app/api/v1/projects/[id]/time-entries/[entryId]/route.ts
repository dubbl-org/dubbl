import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectTask, timeEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { error, handleError, notFound } from "@/lib/api/response";
import { syncProjectBilling } from "@/lib/api/project-billing";
import { timeEntryChangeError } from "@/lib/projects/rules";
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
    await requireProjectAccess(ctx, id, "view");

    const entry = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, entryId),
        eq(timeEntry.projectId, id)
      ),
      with: { user: { columns: { id: true, name: true, email: true, image: true } } },
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

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // Verify project belongs to org
    const { access } = await requireProjectAccess(ctx, id, "contribute");
    // An entry whose invoice was voided or deleted is editable again.
    await syncProjectBilling(db, ctx.organizationId, [id]);

    const existing = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, entryId),
        eq(timeEntry.projectId, id)
      ),
    });

    if (!existing) return notFound("Time entry");

    const blocked = timeEntryChangeError(existing, parsed, { userId: ctx.userId, access });
    if (blocked) return error(blocked.message, blocked.status);

    if (parsed.taskId) {
      const task = await db.query.projectTask.findFirst({
        where: and(eq(projectTask.id, parsed.taskId), eq(projectTask.projectId, id)),
        columns: { id: true },
      });
      if (!task) return notFound("Task");
    }

    const [updated] = await db
      .update(timeEntry)
      .set(parsed)
      .where(eq(timeEntry.id, entryId))
      .returning();

    await syncProjectBilling(db, ctx.organizationId, [id]);

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

    // Verify project belongs to org
    const { access } = await requireProjectAccess(ctx, id, "contribute");
    await syncProjectBilling(db, ctx.organizationId, [id]);

    const existing = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, entryId),
        eq(timeEntry.projectId, id)
      ),
    });

    if (!existing) return notFound("Time entry");

    const blocked = timeEntryChangeError(existing, "delete", { userId: ctx.userId, access });
    if (blocked) return error(blocked.message, blocked.status);

    await db.delete(timeEntry).where(eq(timeEntry.id, entryId));
    await syncProjectBilling(db, ctx.organizationId, [id]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
