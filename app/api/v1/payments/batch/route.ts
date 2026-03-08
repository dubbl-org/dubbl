import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, paymentAllocation, invoice, bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getNextNumber } from "@/lib/api/numbering";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { decimalToCents } from "@/lib/money";
import { z } from "zod";

const batchSchema = z.object({
  type: z.enum(["received", "made"]),
  date: z.string().min(1),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
  bankAccountId: z.string().optional(),
  reference: z.string().optional(),
  contactId: z.string().min(1),
  allocations: z.array(z.object({
    documentId: z.string().min(1),
    documentType: z.enum(["invoice", "bill"]),
    amount: z.number().positive(),
  })).min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = batchSchema.parse(body);

    // Calculate total amount from allocations (convert decimal to cents)
    const totalAmount = parsed.allocations.reduce(
      (sum, a) => sum + decimalToCents(a.amount),
      0
    );

    // Generate payment number
    const paymentNumber = await getNextNumber(
      ctx.organizationId,
      "payment",
      "payment_number",
      "PAY"
    );

    // Create one payment record
    const [created] = await db
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        paymentNumber,
        type: parsed.type,
        date: parsed.date,
        amount: totalAmount,
        method: parsed.method,
        reference: parsed.reference || null,
        bankAccountId: parsed.bankAccountId || null,
        createdBy: ctx.userId,
      })
      .returning();

    // Create allocation records
    await db.insert(paymentAllocation).values(
      parsed.allocations.map((a) => ({
        paymentId: created.id,
        documentType: a.documentType,
        documentId: a.documentId,
        amount: decimalToCents(a.amount),
      }))
    );

    // Update each allocated document
    for (const alloc of parsed.allocations) {
      const allocCents = decimalToCents(alloc.amount);

      if (alloc.documentType === "invoice") {
        const existing = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, alloc.documentId),
            eq(invoice.organizationId, ctx.organizationId)
          ),
        });
        if (existing) {
          const newAmountPaid = existing.amountPaid + allocCents;
          const newAmountDue = existing.amountDue - allocCents;
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          await db
            .update(invoice)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, alloc.documentId));
        }
      } else if (alloc.documentType === "bill") {
        const existing = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, alloc.documentId),
            eq(bill.organizationId, ctx.organizationId)
          ),
        });
        if (existing) {
          const newAmountPaid = existing.amountPaid + allocCents;
          const newAmountDue = existing.amountDue - allocCents;
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          await db
            .update(bill)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, alloc.documentId));
        }
      }
    }

    // Create journal entry
    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        type: parsed.type === "received" ? "invoice" : "bill",
        reference: paymentNumber,
        amount: totalAmount,
        date: parsed.date,
      }
    );

    // Link journal entry to payment
    if (journalEntry) {
      await db
        .update(payment)
        .set({ journalEntryId: journalEntry.id, updatedAt: new Date() })
        .where(eq(payment.id, created.id));
    }

    // Return payment with allocations
    const result = await db.query.payment.findFirst({
      where: eq(payment.id, created.id),
      with: { contact: true, allocations: true },
    });

    return NextResponse.json({ payment: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
