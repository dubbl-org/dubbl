import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, invoice } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const applySchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().int().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:credit-notes");

    const body = await request.json();
    const parsed = applySchema.parse(body);

    // Fetch credit note
    const found = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
    });

    if (!found) return notFound("Credit note");
    if (found.status !== "sent") {
      return NextResponse.json(
        { error: "Only sent credit notes can be applied" },
        { status: 400 }
      );
    }
    if (parsed.amount > found.amountRemaining) {
      return NextResponse.json(
        { error: "Amount exceeds credit note remaining balance" },
        { status: 400 }
      );
    }

    // Fetch invoice
    const foundInvoice = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, parsed.invoiceId),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!foundInvoice) return notFound("Invoice");
    if (foundInvoice.status === "draft" || foundInvoice.status === "void") {
      return NextResponse.json(
        { error: "Cannot apply credit to this invoice status" },
        { status: 400 }
      );
    }

    // Update credit note
    const newAmountApplied = found.amountApplied + parsed.amount;
    const newAmountRemaining = found.amountRemaining - parsed.amount;
    const cnStatus = newAmountRemaining <= 0 ? "applied" : "sent";

    const [updatedCreditNote] = await db
      .update(creditNote)
      .set({
        amountApplied: newAmountApplied,
        amountRemaining: Math.max(0, newAmountRemaining),
        status: cnStatus as typeof creditNote.status.enumValues[number],
        updatedAt: new Date(),
      })
      .where(eq(creditNote.id, id))
      .returning();

    // Update invoice
    const newAmountPaid = foundInvoice.amountPaid + parsed.amount;
    const newAmountDue = foundInvoice.total - newAmountPaid;
    const invoiceStatus = newAmountDue <= 0 ? "paid" : "partial";

    const [updatedInvoice] = await db
      .update(invoice)
      .set({
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: invoiceStatus,
        paidAt: invoiceStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, parsed.invoiceId))
      .returning();

    return NextResponse.json({ creditNote: updatedCreditNote, invoice: updatedInvoice });
  } catch (err) {
    return handleError(err);
  }
}
