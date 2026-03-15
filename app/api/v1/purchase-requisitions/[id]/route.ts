import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseRequisition, purchaseRequisitionLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const item = await db.query.purchaseRequisition.findFirst({
      where: and(
        eq(purchaseRequisition.id, id),
        eq(purchaseRequisition.organizationId, ctx.organizationId),
        notDeleted(purchaseRequisition.deletedAt)
      ),
      with: { contact: true, lines: true },
    });
    if (!item) return notFound("Purchase requisition");
    return NextResponse.json(item);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;
    const body = await request.json();
    const parsed = z
      .object({
        contactId: z.string().nullable().optional(),
        requiredDate: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(body);

    const existing = await db.query.purchaseRequisition.findFirst({
      where: and(
        eq(purchaseRequisition.id, id),
        eq(purchaseRequisition.organizationId, ctx.organizationId),
        notDeleted(purchaseRequisition.deletedAt)
      ),
    });

    if (!existing) return notFound("Purchase requisition");

    const [updated] = await db
      .update(purchaseRequisition)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(purchaseRequisition.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "purchase_requisition", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const [deleted] = await db
      .update(purchaseRequisition)
      .set(softDelete())
      .where(
        and(
          eq(purchaseRequisition.id, id),
          eq(purchaseRequisition.organizationId, ctx.organizationId),
          notDeleted(purchaseRequisition.deletedAt)
        )
      )
      .returning();

    if (!deleted) return notFound("Purchase requisition");

    logAudit({
      ctx,
      action: "delete",
      entityType: "purchase_requisition",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
