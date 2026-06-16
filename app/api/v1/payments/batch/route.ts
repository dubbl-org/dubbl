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

    // A "received" batch settles invoices (AR); a "made" batch settles bills
    // (AP). Reject inconsistent allocations so the journal posts to the correct
    // control account and realised-FX direction.
    const expectedDocType = parsed.type === "received" ? "invoice" : "bill";
    if (parsed.allocations.some((a) => a.documentType !== expectedDocType)) {
      return NextResponse.json(
        { error: `${parsed.type} payments can only settle ${expectedDocType}s` },
        { status: 400 }
      );
    }

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

    // Load each allocated document up front (read-only), computing the new
    // balance/status and capturing currency + issue date for the journal
    // entry's base-currency conversion and realised FX. Reads + the
    // shared-currency guard stay OUTSIDE the transaction; the actual writes
    // happen inside the single transaction below.
    const journalAllocations: {
      amount: number;
      currencyCode: string;
      issueDate: string;
    }[] = [];
    const documentUpdates: {
      documentType: "invoice" | "bill";
      documentId: string;
      amountPaid: number;
      amountDue: number;
      status: "paid" | "partial";
    }[] = [];
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
          documentUpdates.push({
            documentType: "invoice",
            documentId: alloc.documentId,
            amountPaid: newAmountPaid,
            amountDue: Math.max(0, newAmountDue),
            status: newStatus,
          });
          journalAllocations.push({
            amount: allocCents,
            currencyCode: existing.currencyCode,
            issueDate: existing.issueDate,
          });
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
          documentUpdates.push({
            documentType: "bill",
            documentId: alloc.documentId,
            amountPaid: newAmountPaid,
            amountDue: Math.max(0, newAmountDue),
            status: newStatus,
          });
          journalAllocations.push({
            amount: allocCents,
            currencyCode: existing.currencyCode,
            issueDate: existing.issueDate,
          });
        }
      }
    }

    // All settled documents must share one currency for a single journal entry.
    const batchCurrencies = new Set(journalAllocations.map((a) => a.currencyCode));
    if (batchCurrencies.size > 1) {
      return NextResponse.json(
        { error: "All settled documents must share the same currency" },
        { status: 400 }
      );
    }

    // Atomic write sequence: the payment row, its allocations, the document
    // balance/status updates, the GL journal entry, and the payment ->
    // journalEntry link must all COMMIT TOGETHER or ROLL BACK TOGETHER. A
    // thrown MissingExchangeRateError (or any error) inside the transaction
    // rolls everything back, so we never leave orphaned payments or documents
    // marked paid without a ledger entry.
    const { created } = await db.transaction(async (tx) => {
      // Create one payment record
      const [created] = await tx
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
      await tx.insert(paymentAllocation).values(
        parsed.allocations.map((a) => ({
          paymentId: created.id,
          documentType: a.documentType,
          documentId: a.documentId,
          amount: decimalToCents(a.amount),
        }))
      );

      // Apply each allocated document's new balance + status.
      for (const upd of documentUpdates) {
        if (upd.documentType === "invoice") {
          await tx
            .update(invoice)
            .set({
              amountPaid: upd.amountPaid,
              amountDue: upd.amountDue,
              status: upd.status,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, upd.documentId));
        } else {
          await tx
            .update(bill)
            .set({
              amountPaid: upd.amountPaid,
              amountDue: upd.amountDue,
              status: upd.status,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, upd.documentId));
        }
      }

      if (batchCurrencies.size === 1) {
        await tx
          .update(payment)
          .set({ currencyCode: [...batchCurrencies][0] })
          .where(eq(payment.id, created.id));
      }

      // Create journal entry (posts inside the same transaction)
      const journalEntry = await createPaymentJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          type: parsed.type === "received" ? "invoice" : "bill",
          reference: paymentNumber,
          amount: totalAmount,
          date: parsed.date,
          allocations: journalAllocations.length > 0 ? journalAllocations : undefined,
        },
        tx
      );

      // Link journal entry to payment
      if (journalEntry) {
        await tx
          .update(payment)
          .set({ journalEntryId: journalEntry.id, updatedAt: new Date() })
          .where(eq(payment.id, created.id));
      }

      return { created };
    });

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
