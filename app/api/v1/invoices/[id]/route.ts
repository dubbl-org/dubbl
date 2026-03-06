import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, paymentAllocation } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
      with: {
        contact: true,
        lines: {
          with: { account: true, taxRate: true },
        },
      },
    });

    if (!found) return notFound("Invoice");

    // Fetch payments allocated to this invoice
    const allocations = await db.query.paymentAllocation.findMany({
      where: and(
        eq(paymentAllocation.documentType, "invoice"),
        eq(paymentAllocation.documentId, id)
      ),
      with: { payment: true },
    });

    const payments = allocations
      .filter((a) => a.payment)
      .map((a) => ({
        id: a.payment.id,
        paymentNumber: a.payment.paymentNumber,
        date: a.payment.date,
        amount: a.amount,
        method: a.payment.method,
      }));

    return NextResponse.json({ invoice: found, payments });
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
    requireRole(ctx, "manage:invoices");

    const existing = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!existing) return notFound("Invoice");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const [updated] = await db
      .update(invoice)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(invoice.id, id))
      .returning();

    return NextResponse.json({ invoice: updated });
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
    requireRole(ctx, "manage:invoices");

    const existing = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!existing) return notFound("Invoice");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(invoiceLine).where(eq(invoiceLine.invoiceId, id));
    await db.update(invoice).set(softDelete()).where(eq(invoice.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
