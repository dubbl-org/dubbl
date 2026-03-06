import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

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
        notDeleted(recurringTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Recurring template");

    if (existing.status === "completed") {
      return NextResponse.json(
        { error: "Cannot toggle a completed template" },
        { status: 400 }
      );
    }

    const newStatus = existing.status === "active" ? "paused" : "active";

    const [updated] = await db
      .update(recurringTemplate)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(recurringTemplate.id, id))
      .returning();

    return NextResponse.json({ template: updated });
  } catch (err) {
    return handleError(err);
  }
}
