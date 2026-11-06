import { db } from "@/lib/db";
import { timesheetEntry, timesheet, project } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().min(1),
  hours: z.number().positive().max(24),
  shiftType: z.enum(["regular", "overtime", "night", "weekend", "holiday"]).optional(),
  description: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:timesheets");

    const ts = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.id, id),
        eq(timesheet.organizationId, ctx.organizationId),
        notDeleted(timesheet.deletedAt)
      ),
    });

    if (!ts) return notFound("Timesheet");

    const entries = await db.query.timesheetEntry.findMany({
      where: eq(timesheetEntry.timesheetId, id),
      with: { project: true },
    });

    return ok({ data: entries });
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
    requireRole(ctx, "manage:timesheets");

    const ts = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.id, id),
        eq(timesheet.organizationId, ctx.organizationId),
        notDeleted(timesheet.deletedAt)
      ),
    });

    if (!ts) return notFound("Timesheet");
    if (ts.status !== "draft" && ts.status !== "rejected") {
      return validationError("Entries can only be added while a timesheet is a draft or was sent back");
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);
    if (parsed.date < ts.periodStart || parsed.date > ts.periodEnd) {
      return validationError(`The date must be within the timesheet period (${ts.periodStart} to ${ts.periodEnd})`);
    }
    if (parsed.projectId) {
      const proj = await db.query.project.findFirst({
        where: and(eq(project.id, parsed.projectId), eq(project.organizationId, ctx.organizationId)),
        columns: { id: true },
      });
      if (!proj) return notFound("Project");
    }

    const [entry] = await db
      .insert(timesheetEntry)
      .values({ timesheetId: id, ...parsed })
      .returning();

    // Update total hours
    await db
      .update(timesheet)
      .set({
        totalHours: sql`${timesheet.totalHours} + ${parsed.hours}`,
        updatedAt: new Date(),
      })
      .where(eq(timesheet.id, id));

    return created({ entry });
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
    requireRole(ctx, "manage:timesheets");

    const url = new URL(request.url);
    const entryId = url.searchParams.get("entryId");
    if (!entryId) return validationError("entryId required");

    const entry = await db.query.timesheetEntry.findFirst({
      where: and(eq(timesheetEntry.id, entryId), eq(timesheetEntry.timesheetId, id)),
    });
    if (!entry) return notFound("Entry");

    const ts = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.id, entry.timesheetId),
        eq(timesheet.organizationId, ctx.organizationId),
        notDeleted(timesheet.deletedAt)
      ),
    });
    if (!ts) return notFound("Entry");
    if (ts.status !== "draft" && ts.status !== "rejected") {
      return validationError("Entries can only be removed while a timesheet is a draft or was sent back");
    }

    await db.delete(timesheetEntry).where(eq(timesheetEntry.id, entryId));

    // Update total hours
    await db
      .update(timesheet)
      .set({
        totalHours: sql`greatest(${timesheet.totalHours} - ${entry.hours}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(timesheet.id, ts.id));

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
