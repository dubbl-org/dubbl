import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  purchaseRequisition,
  purchaseOrder,
  purchaseOrderLine,
  contact,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;
    // Optional supplier, for an approved request that doesn't have one yet
    const body = await request.json().catch(() => ({}));
    const { contactId } = z.object({ contactId: z.string().min(1).optional() }).parse(body ?? {});

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
    if (contactId && !(await db.query.contact.findFirst({ where: and(eq(contact.id, contactId), eq(contact.organizationId, ctx.organizationId)) }))) {
      return notFound("Supplier");
    }
    const supplierId = contactId || req.contactId;
    if (!supplierId) {
      return NextResponse.json(
        { error: "Choose a supplier for this requisition before creating a purchase order" },
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

    const po = await db.transaction(async (tx) => {
      const [po] = await tx
        .insert(purchaseOrder)
        .values({
          organizationId: ctx.organizationId,
          contactId: supplierId,
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
        await tx.insert(purchaseOrderLine).values(
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

      await tx
        .update(purchaseRequisition)
        .set({
          status: "converted",
          contactId: supplierId,
          convertedPoId: po.id,
          updatedAt: new Date(),
        })
        .where(and(eq(purchaseRequisition.id, id), eq(purchaseRequisition.status, "approved")));

      return po;
    });

    logAudit({ ctx, action: "convert", entityType: "purchase_requisition", entityId: id, changes: { previousStatus: "approved", purchaseOrderId: po.id }, request });

    return NextResponse.json({ purchaseOrder: po }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
