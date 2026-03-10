import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  paymentBatch,
  paymentBatchItem,
  payment,
  paymentAllocation,
  bill,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const existing = await db.query.paymentBatch.findFirst({
      where: and(
        eq(paymentBatch.id, id),
        eq(paymentBatch.organizationId, ctx.organizationId),
        notDeleted(paymentBatch.deletedAt)
      ),
      with: { items: true },
    });

    if (!existing) return notFound("Payment batch");

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft batches can be submitted" },
        { status: 400 }
      );
    }

    // Mark as submitted
    await db
      .update(paymentBatch)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(paymentBatch.id, id));

    const today = new Date().toISOString().split("T")[0];
    let processed = 0;

    for (const item of existing.items) {
      if (!item.billId || !item.contactId) continue;

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
            contactId: item.contactId,
            paymentNumber,
            type: "made",
            date: today,
            amount: item.amount,
            method: "bank_transfer",
            createdBy: ctx.userId,
          })
          .returning();

        // Create allocation
        await db.insert(paymentAllocation).values({
          paymentId: createdPayment.id,
          documentType: "bill",
          documentId: item.billId,
          amount: item.amount,
        });

        // Update bill
        const existingBill = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, item.billId),
            eq(bill.organizationId, ctx.organizationId)
          ),
        });

        if (existingBill) {
          const newAmountPaid = existingBill.amountPaid + item.amount;
          const newAmountDue = existingBill.amountDue - item.amount;
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          await db
            .update(bill)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, item.billId));
        }

        // Create journal entry
        const journalEntry = await createPaymentJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            type: "bill",
            reference: paymentNumber,
            amount: item.amount,
            date: today,
          }
        );

        if (journalEntry) {
          await db
            .update(payment)
            .set({ journalEntryId: journalEntry.id, updatedAt: new Date() })
            .where(eq(payment.id, createdPayment.id));
        }

        // Mark batch item as completed
        await db
          .update(paymentBatchItem)
          .set({ status: "completed" })
          .where(eq(paymentBatchItem.id, item.id));

        processed++;
      } catch {
        // Mark item as failed
        await db
          .update(paymentBatchItem)
          .set({ status: "failed" })
          .where(eq(paymentBatchItem.id, item.id));
      }
    }

    // Mark batch as completed
    await db
      .update(paymentBatch)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(paymentBatch.id, id));

    const result = await db.query.paymentBatch.findFirst({
      where: eq(paymentBatch.id, id),
      with: {
        items: {
          with: {
            bill: { with: { contact: true } },
            contact: true,
          },
        },
      },
    });

    return NextResponse.json({
      batch: result,
      processed,
      total: existing.items.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
