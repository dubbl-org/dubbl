import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseOrder, bill, billLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const found = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, id),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Purchase order");
    if (found.status === "draft" || found.status === "void" || found.status === "closed") {
      return NextResponse.json(
        { error: "Purchase order cannot be converted in its current status" },
        { status: 400 }
      );
    }
    if (found.convertedBillId) {
      return NextResponse.json(
        { error: "Purchase order has already been converted to a bill" },
        { status: 400 }
      );
    }

    const billNumber = await getNextNumber(ctx.organizationId, "bill", "bill_number", "BILL");

    // Create the bill from PO data
    const [createdBill] = await db
      .insert(bill)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        billNumber,
        issueDate: found.issueDate,
        dueDate: found.deliveryDate || found.issueDate,
        reference: found.reference,
        notes: found.notes,
        subtotal: found.subtotal,
        taxTotal: found.taxTotal,
        total: found.total,
        amountPaid: 0,
        amountDue: found.total,
        currencyCode: found.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    // Copy PO lines to bill lines
    if (found.lines.length > 0) {
      await db.insert(billLine).values(
        found.lines.map((l) => ({
          billId: createdBill.id,
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

    // Mark PO as closed and link to the created bill
    const [updatedPO] = await db
      .update(purchaseOrder)
      .set({
        status: "closed",
        convertedBillId: createdBill.id,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrder.id, id))
      .returning();

    return NextResponse.json({ purchaseOrder: updatedPO, bill: createdBill }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
