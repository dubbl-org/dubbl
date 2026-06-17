import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
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
  currencyCode: z.string().optional(),
  // Toggle recurring-invoice automation (see the create route for semantics).
  autoSend: z.boolean().optional(),
  createAsApproved: z.boolean().optional(),
});

async function findInvoiceTemplate(id: string, organizationId: string) {
  return db.query.recurringTemplate.findFirst({
    where: and(
      eq(recurringTemplate.id, id),
      eq(recurringTemplate.organizationId, organizationId),
      eq(recurringTemplate.type, "invoice"),
      notDeleted(recurringTemplate.deletedAt)
    ),
    with: { contact: true, lines: true },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await findInvoiceTemplate(id, ctx.organizationId);
    if (!found) return notFound("Recurring invoice");
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

    const existing = await findInvoiceTemplate(id, ctx.organizationId);
    if (!existing) return notFound("Recurring invoice");

    const [updated] = await db
      .update(recurringTemplate)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(recurringTemplate.id, id))
      .returning();

    logAudit({
      ctx,
      action: "update",
      entityType: "recurring_invoice",
      entityId: id,
      changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>),
      request,
    });

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

    const existing = await findInvoiceTemplate(id, ctx.organizationId);
    if (!existing) return notFound("Recurring invoice");

    await db
      .update(recurringTemplate)
      .set(softDelete())
      .where(eq(recurringTemplate.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "recurring_invoice",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
