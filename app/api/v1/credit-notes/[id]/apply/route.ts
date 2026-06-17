import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, invoice, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
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
    if (parsed.amount > foundInvoice.amountDue) {
      return NextResponse.json(
        { error: "Amount exceeds invoice amount due" },
        { status: 400 }
      );
    }

    // Compute new credit-note balances/status
    const newAmountApplied = found.amountApplied + parsed.amount;
    const newAmountRemaining = found.amountRemaining - parsed.amount;
    const cnStatus = newAmountRemaining <= 0 ? "applied" : "sent";

    // Compute new invoice balances/status
    const newAmountPaid = foundInvoice.amountPaid + parsed.amount;
    const newAmountDue = foundInvoice.total - newAmountPaid;
    const invoiceStatus = newAmountDue <= 0 ? "paid" : "partial";

    // Generate a payment number so the allocation has a carrier row.
    const paymentNumber = await getNextNumber(
      ctx.organizationId,
      "payment",
      "payment_number",
      "PAY"
    );

    // ----------------------------------------------------------------------
    // AR-once reasoning (NO journal entry is posted here):
    //
    // When the credit note was issued (send route → createCreditNoteJournalEntry)
    // it ALREADY posted DR Revenue / DR Output VAT / CR Accounts Receivable (1200)
    // for the full total — so Accounts Receivable was relieved (credited) once at
    // issue time. The invoice, in turn, had debited AR when it was recognized.
    //
    // Applying the credit note to the invoice is purely an open-item OFFSET: it
    // nets the credit note's existing AR credit against the invoice's existing AR
    // debit in the sub-ledger. The AR control balance is already correct (net of
    // both documents). Posting another AR-relieving entry here would credit AR a
    // SECOND time (double relief) and break the tie between the GL control account
    // and the open-item ledger. Therefore we ONLY record the allocation + decrement
    // balances + update statuses, and post no journal entry.
    // ----------------------------------------------------------------------
    const { updatedCreditNote, updatedInvoice } = await db.transaction(
      async (tx) => {
        // Carrier payment row for the allocation. No bank movement, no journal
        // entry — AR was already relieved at issue, so this records the offset
        // only.
        const [createdPayment] = await tx
          .insert(payment)
          .values({
            organizationId: ctx.organizationId,
            contactId: found.contactId,
            paymentNumber,
            type: "received",
            date: found.issueDate,
            amount: parsed.amount,
            method: "other",
            reference: found.creditNoteNumber,
            notes: `Credit note ${found.creditNoteNumber} applied to invoice ${foundInvoice.invoiceNumber}`,
            currencyCode: found.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        // Record the credit-note allocation linking credit note -> invoice. The
        // credit_note allocation is the authoritative open-item link; the invoice
        // allocation lets the invoice ledger tie out too.
        await tx.insert(paymentAllocation).values([
          {
            paymentId: createdPayment.id,
            documentType: "credit_note",
            documentId: id,
            amount: parsed.amount,
          },
          {
            paymentId: createdPayment.id,
            documentType: "invoice",
            documentId: parsed.invoiceId,
            amount: parsed.amount,
          },
        ]);

        const [updatedCreditNote] = await tx
          .update(creditNote)
          .set({
            amountApplied: newAmountApplied,
            amountRemaining: Math.max(0, newAmountRemaining),
            status: cnStatus as (typeof creditNote.status.enumValues)[number],
            updatedAt: new Date(),
          })
          .where(eq(creditNote.id, id))
          .returning();

        const [updatedInvoice] = await tx
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

        return { updatedCreditNote, updatedInvoice };
      }
    );

    logAudit({ ctx, action: "apply", entityType: "credit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ creditNote: updatedCreditNote, invoice: updatedInvoice });
  } catch (err) {
    return handleError(err);
  }
}
