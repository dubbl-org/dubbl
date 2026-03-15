import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSchedule, savedReport } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  savedReportId: z.string().uuid(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  format: z.enum(["pdf", "csv", "xlsx"]).default("pdf"),
  recipients: z.array(z.string().email()).min(1),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  timeOfDay: z.string().default("08:00"),
  timezone: z.string().default("UTC"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(reportSchedule.organizationId, ctx.organizationId),
      notDeleted(reportSchedule.deletedAt),
    ];

    const items = await db.query.reportSchedule.findMany({
      where: and(...conditions),
      orderBy: desc(reportSchedule.createdAt),
      limit,
      offset,
      with: { savedReport: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(reportSchedule)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        items,
        Number(countResult?.count || 0),
        page,
        limit
      )
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:reports");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Validate the saved report exists and belongs to this org
    const report = await db.query.savedReport.findFirst({
      where: and(
        eq(savedReport.id, parsed.savedReportId),
        eq(savedReport.organizationId, ctx.organizationId),
        notDeleted(savedReport.deletedAt)
      ),
    });

    if (!report) {
      return NextResponse.json(
        { error: "Saved report not found" },
        { status: 404 }
      );
    }

    // Calculate initial nextRunAt
    const now = new Date();
    const nextRunAt = new Date(now);
    nextRunAt.setDate(nextRunAt.getDate() + 1);

    const [created] = await db
      .insert(reportSchedule)
      .values({
        organizationId: ctx.organizationId,
        savedReportId: parsed.savedReportId,
        frequency: parsed.frequency,
        format: parsed.format,
        recipients: parsed.recipients,
        dayOfWeek: parsed.dayOfWeek ?? null,
        dayOfMonth: parsed.dayOfMonth ?? null,
        timeOfDay: parsed.timeOfDay,
        timezone: parsed.timezone,
        nextRunAt,
      })
      .returning();

    const result = await db.query.reportSchedule.findFirst({
      where: eq(reportSchedule.id, created.id),
      with: { savedReport: true },
    });

    logAudit({ ctx, action: "create", entityType: "report_schedule", entityId: created.id, request });

    return NextResponse.json({ reportSchedule: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
