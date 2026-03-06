import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"]).optional(),
  status: z.enum(["active", "paused", "completed"]).optional(),
  endDate: z.string().nullable().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
      with: {
        contact: true,
        lines: true,
      },
    });

    if (!found) return notFound("Recurring template");
    return NextResponse.json({ template: found });
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
    requireRole(ctx, "manage:recurring");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Recurring template");

    const [updated] = await db
      .update(recurringTemplate)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(recurringTemplate.id, id))
      .returning();

    return NextResponse.json({ template: updated });
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
    requireRole(ctx, "manage:recurring");

    const existing = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Recurring template");

    await db
      .update(recurringTemplate)
      .set(softDelete())
      .where(eq(recurringTemplate.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
