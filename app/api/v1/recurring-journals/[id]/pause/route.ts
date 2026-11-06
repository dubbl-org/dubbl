import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { resumeSchedule } from "@/lib/api/recurring-schedule";

/**
 * Toggle a recurring journal template between active and paused. A paused
 * template is skipped by the daily recurring-journals scheduler; resuming it
 * does NOT back-fill the gap: dates missed while paused are skipped and the
 * next run moves forward to the first scheduled date on or after today.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:recurring");

    const existing = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        eq(recurringTemplate.type, "journal"),
        notDeleted(recurringTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Recurring journal");

    if (existing.status === "completed") {
      return NextResponse.json(
        { error: "Cannot toggle a completed template" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const changes =
      existing.status === "active"
        ? { status: "paused" as const }
        : resumeSchedule(existing, today);

    const [updated] = await db
      .update(recurringTemplate)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(recurringTemplate.id, id))
      .returning();

    logAudit({
      ctx,
      action: "update",
      entityType: "recurring_journal",
      entityId: id,
      changes,
      request,
    });

    return NextResponse.json({ template: updated });
  } catch (err) {
    return handleError(err);
  }
}
