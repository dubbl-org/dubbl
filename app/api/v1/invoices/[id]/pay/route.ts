import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

const paySchema = z.object({
  amount: z.number().int().min(1),
  date: z.string().min(1),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
  reference: z.string().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = paySchema.parse(body);

    // Recording a payment posts DR Bank / CR AR — block it if the payment date
    // falls in a locked/closed period.
    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!found) return notFound("Invoice");
    if (found.status === "draft" || found.status === "void") {
      return NextResponse.json(
        { error: "Cannot record payment for this invoice status" },
        { status: 400 }
      );
    }
    // Don't accept more than is outstanding — an overpayment would drive the
    // balance negative and overstate cash received.
    if (parsed.amount > found.amountDue) {
      return NextResponse.json(
        { error: "Payment is more than the amount still due on this invoice." },
        { status: 400 }
      );
    }

    const newAmountPaid = found.amountPaid + parsed.amount;
    const newAmountDue = found.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial";

    // Generate payment number
    const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

    // Wrap the payment, allocation, journal entry, journal-entry link, and
    // invoice balance/status updates in a single transaction so they all commit
    // together or roll back together. A thrown MissingExchangeRateError (or any
    // error) leaves no orphaned payment / invoice-marked-paid-without-ledger.
    const { created, updated } = await db.transaction(async (tx) => {
      // Create payment record
      const [created] = await tx
        .insert(payment)
        .values({
          organizationId: ctx.organizationId,
          contactId: found.contactId,
          paymentNumber,
          type: "received",
          date: parsed.date,
          amount: parsed.amount,
          method: parsed.method,
          reference: parsed.reference || null,
          bankAccountId: parsed.bankAccountId || null,
          createdBy: ctx.userId,
        })
        .returning();

      // Create allocation linking payment to this invoice
      await tx.insert(paymentAllocation).values({
        paymentId: created.id,
        documentType: "invoice",
        documentId: id,
        amount: parsed.amount,
      });

      // Create payment journal entry
      const journalEntry = await createPaymentJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          type: "invoice",
          reference: paymentNumber,
          amount: parsed.amount,
          date: parsed.date,
          allocations: [
            {
              amount: parsed.amount,
              currencyCode: found.currencyCode,
              issueDate: found.issueDate,
            },
          ],
        },
        tx
      );

      if (journalEntry) {
        await tx
          .update(payment)
          .set({ journalEntryId: journalEntry.id })
          .where(eq(payment.id, created.id));
      }

      // Update invoice amounts
      const [updated] = await tx
        .update(invoice)
        .set({
          amountPaid: newAmountPaid,
          amountDue: Math.max(0, newAmountDue),
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, id))
        .returning();

      return { created, updated };
    });

    logAudit({ ctx, action: "pay", entityType: "invoice", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({
      invoice: updated,
      payment: {
        id: created.id,
        paymentNumber: created.paymentNumber,
        date: created.date,
        amount: parsed.amount,
        method: created.method,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
