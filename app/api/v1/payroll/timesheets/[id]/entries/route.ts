import { db } from "@/lib/db";
import { timesheetEntry, timesheet } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().min(1),
  hours: z.number().min(0),
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
    if (ts.status !== "draft") return validationError("Can only add entries to draft timesheets");

    const body = await request.json();
    const parsed = createSchema.parse(body);

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
      where: eq(timesheetEntry.id, entryId),
    });
    if (!entry) return notFound("Entry");

    await db.delete(timesheetEntry).where(eq(timesheetEntry.id, entryId));

    // Update total hours
    await db
      .update(timesheet)
      .set({
        totalHours: sql`greatest(${timesheet.totalHours} - ${entry.hours}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(timesheet.id, id));

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
