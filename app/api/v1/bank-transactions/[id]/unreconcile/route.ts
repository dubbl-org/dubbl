import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, payment, paymentAllocation, invoice, bill, journalEntry, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Find the transaction and verify ownership through bank account
    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
      with: { bankAccount: true },
    });

    if (!transaction) return notFound("Bank transaction");

    // Verify the bank account belongs to this organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank transaction");

    if (transaction.status !== "reconciled") {
      return NextResponse.json(
        { error: "Transaction is not reconciled" },
        { status: 400 }
      );
    }

    let linkedPaymentId: string | null = null;
    let reversedAllocations = 0;

    // Check if there's a linked payment
    const linkedPayment = await db.query.payment.findFirst({
      where: and(
        eq(payment.bankTransactionId, id),
        notDeleted(payment.deletedAt)
      ),
      with: { allocations: true },
    });

    if (linkedPayment) {
      linkedPaymentId = linkedPayment.id;

      // Reverse allocations on bills and invoices
      for (const allocation of linkedPayment.allocations) {
        if (allocation.documentType === "bill") {
          const existingBill = await db.query.bill.findFirst({
            where: eq(bill.id, allocation.documentId),
          });

          if (existingBill) {
            const newAmountPaid = existingBill.amountPaid - allocation.amount;
            const newAmountDue = existingBill.amountDue + allocation.amount;
            const newStatus = newAmountPaid > 0 ? "partial" : "received";

            await db
              .update(bill)
              .set({
                amountPaid: newAmountPaid,
                amountDue: newAmountDue,
                status: newStatus,
                paidAt: null,
                updatedAt: new Date(),
              })
              .where(eq(bill.id, allocation.documentId));
          }
        } else if (allocation.documentType === "invoice") {
          const existingInvoice = await db.query.invoice.findFirst({
            where: eq(invoice.id, allocation.documentId),
          });

          if (existingInvoice) {
            const newAmountPaid = existingInvoice.amountPaid - allocation.amount;
            const newAmountDue = existingInvoice.amountDue + allocation.amount;
            const newStatus = newAmountPaid > 0 ? "partial" : "sent";

            await db
              .update(invoice)
              .set({
                amountPaid: newAmountPaid,
                amountDue: newAmountDue,
                status: newStatus,
                paidAt: null,
                updatedAt: new Date(),
              })
              .where(eq(invoice.id, allocation.documentId));
          }
        }

        reversedAllocations++;
      }

      // Delete payment allocations
      if (linkedPayment.allocations.length > 0) {
        await db
          .delete(paymentAllocation)
          .where(eq(paymentAllocation.paymentId, linkedPayment.id));
      }

      // Soft-delete the linked journal entry if present
      if (linkedPayment.journalEntryId) {
        await db
          .update(journalEntry)
          .set({
            status: "void",
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(journalEntry.id, linkedPayment.journalEntryId));
      }

      // Soft-delete the payment
      await db
        .update(payment)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payment.id, linkedPayment.id));
    }

    // Reset the transaction
    const [updated] = await db
      .update(bankTransaction)
      .set({
        status: "unreconciled",
        reconciliationId: null,
        journalEntryId: null,
      })
      .where(eq(bankTransaction.id, id))
      .returning();

    // Log to audit log
    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "unreconciled",
      entityType: "bank_transaction",
      entityId: id,
      changes: {
        previousStatus: "reconciled",
        paymentId: linkedPaymentId,
        reversedAllocations,
      },
    });

    return NextResponse.json({ transaction: updated });
  } catch (err) {
    return handleError(err);
  }
}
