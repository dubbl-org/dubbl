import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectTask, timeEntry } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { resolveTimeEntryRate, syncProjectBilling } from "@/lib/api/project-billing";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().min(1),
  description: z.string().nullable().optional(),
  minutes: z.number().int().min(1),
  isBillable: z.boolean().default(true),
  hourlyRate: z.number().int().min(0).optional(),
  taskId: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    // Verify project belongs to org
    await requireProjectAccess(ctx, id, "view");
    // Entries on voided/deleted invoices become unbilled again.
    await syncProjectBilling(db, ctx.organizationId, [id]);

    const entries = await db.query.timeEntry.findMany({
      where: eq(timeEntry.projectId, id),
      orderBy: desc(timeEntry.date),
      limit,
      offset,
      with: { user: { columns: { id: true, name: true, email: true, image: true } } },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(timeEntry)
      .where(eq(timeEntry.projectId, id));

    return NextResponse.json(
      paginatedResponse(entries, Number(countResult?.count || 0), page, limit)
    );
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

    // Verify project belongs to org
    const { project: proj } = await requireProjectAccess(ctx, id, "contribute");

    if (parsed.taskId) {
      const task = await db.query.projectTask.findFirst({
        where: and(eq(projectTask.id, parsed.taskId), eq(projectTask.projectId, id)),
        columns: { id: true },
      });
      if (!task) return notFound("Task");
    }

    // Rate cascade: explicit > member rate > project rate
    const rate = parsed.hourlyRate ?? (await resolveTimeEntryRate(db, proj, ctx.userId));

    const [created] = await db
      .insert(timeEntry)
      .values({
        projectId: id,
        userId: ctx.userId,
        date: parsed.date,
        description: parsed.description || null,
        minutes: parsed.minutes,
        isBillable: parsed.isBillable,
        hourlyRate: rate,
        taskId: parsed.taskId || null,
      })
      .returning();

    await syncProjectBilling(db, ctx.organizationId, [id]);

    logAudit({ ctx, action: "create", entityType: "time_entry", entityId: created.id, request });

    return NextResponse.json({ timeEntry: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
