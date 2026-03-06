import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, timeEntry } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
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
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const entries = await db.query.timeEntry.findMany({
      where: eq(timeEntry.projectId, id),
      orderBy: desc(timeEntry.date),
      limit,
      offset,
      with: { user: true },
    });

    const [countResult] = await db
      .select({ count: db.$count(timeEntry) })
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
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Verify project belongs to org
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const rate = parsed.hourlyRate ?? proj.hourlyRate;

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

    // Update project totals
    await db
      .update(project)
      .set({
        totalHours: proj.totalHours + parsed.minutes,
        updatedAt: new Date(),
      })
      .where(eq(project.id, id));

    return NextResponse.json({ timeEntry: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
