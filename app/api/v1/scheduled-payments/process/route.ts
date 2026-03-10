import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  scheduledPayment,
  payment,
  paymentAllocation,
  bill,
} from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const today = new Date().toISOString().split("T")[0];

    // Find all due scheduled payments
    const duePayments = await db.query.scheduledPayment.findMany({
      where: and(
        eq(scheduledPayment.organizationId, ctx.organizationId),
        eq(scheduledPayment.status, "pending"),
        lte(scheduledPayment.scheduledDate, today),
        notDeleted(scheduledPayment.deletedAt)
      ),
      with: { bill: true, contact: true },
    });

    let processed = 0;

    for (const sp of duePayments) {
      if (!sp.billId || !sp.contactId) continue;

      // Mark as processing
      await db
        .update(scheduledPayment)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(scheduledPayment.id, sp.id));

      try {
        // Generate payment number
        const paymentNumber = await getNextNumber(
          ctx.organizationId,
          "payment",
          "payment_number",
          "PAY"
        );

        // Create payment record
        const [createdPayment] = await db
          .insert(payment)
          .values({
            organizationId: ctx.organizationId,
            contactId: sp.contactId,
            paymentNumber,
            type: "made",
            date: sp.scheduledDate,
            amount: sp.amount,
            method: "bank_transfer",
            notes: sp.notes,
            createdBy: ctx.userId,
          })
          .returning();

        // Create allocation
        await db.insert(paymentAllocation).values({
          paymentId: createdPayment.id,
          documentType: "bill",
          documentId: sp.billId,
          amount: sp.amount,
        });

        // Update bill
        const existingBill = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, sp.billId),
            eq(bill.organizationId, ctx.organizationId)
          ),
        });

        if (existingBill) {
          const newAmountPaid = existingBill.amountPaid + sp.amount;
          const newAmountDue = existingBill.amountDue - sp.amount;
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          await db
            .update(bill)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, sp.billId));
        }

        // Create journal entry
        const journalEntry = await createPaymentJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            type: "bill",
            reference: paymentNumber,
            amount: sp.amount,
            date: sp.scheduledDate,
          }
        );

        if (journalEntry) {
          await db
            .update(payment)
            .set({ journalEntryId: journalEntry.id, updatedAt: new Date() })
            .where(eq(payment.id, createdPayment.id));
        }

        // Mark scheduled payment as completed
        await db
          .update(scheduledPayment)
          .set({
            status: "completed",
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scheduledPayment.id, sp.id));

        processed++;
      } catch {
        // Mark as failed on error
        await db
          .update(scheduledPayment)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(scheduledPayment.id, sp.id));
      }
    }

    return NextResponse.json({
      processed,
      total: duePayments.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
