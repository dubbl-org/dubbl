import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledPayment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  scheduledDate: z.string().optional(),
  amount: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["cancelled"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const existing = await db.query.scheduledPayment.findFirst({
      where: and(
        eq(scheduledPayment.id, id),
        eq(scheduledPayment.organizationId, ctx.organizationId),
        notDeleted(scheduledPayment.deletedAt)
      ),
    });

    if (!existing) return notFound("Scheduled payment");

    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending scheduled payments can be updated" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.scheduledDate !== undefined)
      updates.scheduledDate = parsed.scheduledDate;
    if (parsed.amount !== undefined) updates.amount = parsed.amount;
    if (parsed.notes !== undefined) updates.notes = parsed.notes;
    if (parsed.status === "cancelled") updates.status = "cancelled";

    await db
      .update(scheduledPayment)
      .set(updates)
      .where(eq(scheduledPayment.id, id));

    const result = await db.query.scheduledPayment.findFirst({
      where: eq(scheduledPayment.id, id),
      with: { bill: { with: { contact: true } }, contact: true },
    });

    return NextResponse.json({ scheduledPayment: result });
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
    requireRole(ctx, "manage:payments");

    const existing = await db.query.scheduledPayment.findFirst({
      where: and(
        eq(scheduledPayment.id, id),
        eq(scheduledPayment.organizationId, ctx.organizationId),
        notDeleted(scheduledPayment.deletedAt)
      ),
    });

    if (!existing) return notFound("Scheduled payment");

    await db
      .update(scheduledPayment)
      .set(softDelete())
      .where(eq(scheduledPayment.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
