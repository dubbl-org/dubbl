import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  purchaseRequisition,
  purchaseRequisitionLine,
  purchaseOrder,
  purchaseOrderLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { getNextNumber } from "@/lib/api/numbering";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const req = await db.query.purchaseRequisition.findFirst({
      where: and(
        eq(purchaseRequisition.id, id),
        eq(purchaseRequisition.organizationId, ctx.organizationId),
        eq(purchaseRequisition.status, "approved"),
        notDeleted(purchaseRequisition.deletedAt)
      ),
      with: { lines: true },
    });

    if (!req) return notFound("Approved purchase requisition");
    if (!req.contactId) {
      return NextResponse.json(
        { error: "Requisition must have a contact to convert" },
        { status: 400 }
      );
    }

    const poNumber = await getNextNumber(
      ctx.organizationId,
      "purchase_order",
      "po_number",
      "PO"
    );
    const today = new Date().toISOString().split("T")[0];

    const [po] = await db
      .insert(purchaseOrder)
      .values({
        organizationId: ctx.organizationId,
        contactId: req.contactId,
        poNumber,
        issueDate: today,
        deliveryDate: req.requiredDate,
        reference: req.reference,
        notes: req.notes,
        subtotal: req.subtotal,
        taxTotal: req.taxTotal,
        total: req.total,
        currencyCode: req.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    if (req.lines.length > 0) {
      await db.insert(purchaseOrderLine).values(
        req.lines.map((l) => ({
          purchaseOrderId: po.id,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          accountId: l.accountId,
          taxRateId: l.taxRateId,
          taxAmount: l.taxAmount,
          amount: l.amount,
          sortOrder: l.sortOrder,
        }))
      );
    }

    await db
      .update(purchaseRequisition)
      .set({
        status: "converted",
        convertedPoId: po.id,
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequisition.id, id));

    logAudit({ ctx, action: "convert", entityType: "purchase_requisition", entityId: id, changes: { previousStatus: "approved" }, request });

    return NextResponse.json({ purchaseOrder: po }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
