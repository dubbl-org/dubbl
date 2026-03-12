import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSchedule } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  format: z.enum(["pdf", "csv", "xlsx"]).optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  timeOfDay: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.reportSchedule.findFirst({
      where: and(
        eq(reportSchedule.id, id),
        eq(reportSchedule.organizationId, ctx.organizationId),
        notDeleted(reportSchedule.deletedAt)
      ),
      with: { savedReport: true },
    });

    if (!found) return notFound("Report schedule");
    return NextResponse.json({ reportSchedule: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:reports");

    const existing = await db.query.reportSchedule.findFirst({
      where: and(
        eq(reportSchedule.id, id),
        eq(reportSchedule.organizationId, ctx.organizationId),
        notDeleted(reportSchedule.deletedAt)
      ),
    });

    if (!existing) return notFound("Report schedule");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.frequency !== undefined) updates.frequency = parsed.frequency;
    if (parsed.format !== undefined) updates.format = parsed.format;
    if (parsed.recipients !== undefined) updates.recipients = parsed.recipients;
    if (parsed.dayOfWeek !== undefined) updates.dayOfWeek = parsed.dayOfWeek;
    if (parsed.dayOfMonth !== undefined) updates.dayOfMonth = parsed.dayOfMonth;
    if (parsed.timeOfDay !== undefined) updates.timeOfDay = parsed.timeOfDay;
    if (parsed.timezone !== undefined) updates.timezone = parsed.timezone;
    if (parsed.isActive !== undefined) updates.isActive = parsed.isActive;

    const [updated] = await db
      .update(reportSchedule)
      .set(updates)
      .where(eq(reportSchedule.id, id))
      .returning();

    const result = await db.query.reportSchedule.findFirst({
      where: eq(reportSchedule.id, id),
      with: { savedReport: true },
    });

    return NextResponse.json({ reportSchedule: result });
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
    requireRole(ctx, "manage:reports");

    const existing = await db.query.reportSchedule.findFirst({
      where: and(
        eq(reportSchedule.id, id),
        eq(reportSchedule.organizationId, ctx.organizationId),
        notDeleted(reportSchedule.deletedAt)
      ),
    });

    if (!existing) return notFound("Report schedule");

    await db
      .update(reportSchedule)
      .set(softDelete())
      .where(eq(reportSchedule.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
