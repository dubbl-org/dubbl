import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, invoice, bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.payment.findFirst({
      where: and(
        eq(payment.id, id),
        eq(payment.organizationId, ctx.organizationId),
        notDeleted(payment.deletedAt)
      ),
      with: {
        contact: true,
        bankAccount: true,
        allocations: true,
      },
    });

    if (!found) return notFound("Payment");
    return NextResponse.json({ payment: found });
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

    const existing = await db.query.payment.findFirst({
      where: and(
        eq(payment.id, id),
        eq(payment.organizationId, ctx.organizationId),
        notDeleted(payment.deletedAt)
      ),
      with: { allocations: true },
    });

    if (!existing) return notFound("Payment");

    await assertNotLocked(ctx.organizationId, existing.date);

    // Reverse allocations on documents
    for (const alloc of existing.allocations) {
      if (alloc.documentType === "invoice") {
        const doc = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, alloc.documentId),
            eq(invoice.organizationId, ctx.organizationId)
          ),
        });
        if (doc) {
          const newAmountPaid = Math.max(0, doc.amountPaid - alloc.amount);
          const newAmountDue = doc.amountDue + alloc.amount;
          const newStatus = newAmountPaid <= 0
            ? (doc.status === "paid" || doc.status === "partial" ? "sent" : doc.status)
            : "partial";
          await db
            .update(invoice)
            .set({
              amountPaid: newAmountPaid,
              amountDue: newAmountDue,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, alloc.documentId));
        }
      } else if (alloc.documentType === "bill") {
        const doc = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, alloc.documentId),
            eq(bill.organizationId, ctx.organizationId)
          ),
        });
        if (doc) {
          const newAmountPaid = Math.max(0, doc.amountPaid - alloc.amount);
          const newAmountDue = doc.amountDue + alloc.amount;
          const newStatus = newAmountPaid <= 0
            ? (doc.status === "paid" || doc.status === "partial" ? "received" : doc.status)
            : "partial";
          await db
            .update(bill)
            .set({
              amountPaid: newAmountPaid,
              amountDue: newAmountDue,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, alloc.documentId));
        }
      }
    }

    // Soft-delete the payment
    await db
      .update(payment)
      .set(softDelete())
      .where(eq(payment.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "payment",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
