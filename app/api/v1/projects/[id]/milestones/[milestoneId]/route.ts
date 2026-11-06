import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectMilestone } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { error, handleError, notFound } from "@/lib/api/response";
import { syncProjectBilling } from "@/lib/api/project-billing";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["upcoming", "in_progress", "completed", "overdue"]).optional(),
  dueDate: z.string().nullable().optional(),
  amount: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

    const existing = await db.query.projectMilestone.findFirst({
      where: and(
        eq(projectMilestone.id, milestoneId),
        eq(projectMilestone.projectId, id)
      ),
    });

    if (!existing) return notFound("Milestone");

    const setData: Record<string, unknown> = { ...parsed };
    if (parsed.status === "completed" && existing.status !== "completed") {
      setData.completedAt = new Date();
    } else if (parsed.status && parsed.status !== "completed") {
      setData.completedAt = null;
    }

    const [updated] = await db
      .update(projectMilestone)
      .set(setData)
      .where(eq(projectMilestone.id, milestoneId))
      .returning();

    return NextResponse.json({ milestone: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "manage");
    await syncProjectBilling(db, ctx.organizationId, [id]);

    const existing = await db.query.projectMilestone.findFirst({
      where: and(eq(projectMilestone.id, milestoneId), eq(projectMilestone.projectId, id)),
    });
    if (!existing) return notFound("Milestone");
    if (existing.invoicedAmountCents > 0) {
      return error("This milestone is on an invoice. Void or delete the invoice first.", 409);
    }

    await db
      .delete(projectMilestone)
      .where(and(
        eq(projectMilestone.id, milestoneId),
        eq(projectMilestone.projectId, id)
      ));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
