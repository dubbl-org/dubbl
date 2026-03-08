import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, invoice, bill, payment, paymentAllocation, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

const splitSchema = z.object({
  allocations: z.array(z.object({
    documentType: z.enum(["invoice", "bill"]),
    documentId: z.string().min(1),
    amount: z.number().int().min(1),
  })).min(1),
  date: z.string().min(1),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const parsed = splitSchema.parse(body);

    // Verify transaction ownership
    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
    });
    if (!transaction) return notFound("Bank transaction");

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!account) return notFound("Bank transaction");

    if (transaction.status === "reconciled") {
      return NextResponse.json({ error: "Transaction already reconciled" }, { status: 400 });
    }

    // Validate total allocations don't exceed transaction amount
    const totalAllocated = parsed.allocations.reduce((sum, a) => sum + a.amount, 0);
    const absTransactionAmount = Math.abs(transaction.amount);

    if (totalAllocated > absTransactionAmount) {
      return NextResponse.json(
        { error: "Total allocations exceed transaction amount" },
        { status: 400 }
      );
    }

    // Validate document types match transaction direction
    const isOutgoing = transaction.amount < 0;

    if (isOutgoing) {
      const invalidAllocation = parsed.allocations.find((a) => a.documentType !== "bill");
      if (invalidAllocation) {
        return NextResponse.json(
          { error: "Outgoing transactions can only be split across bills" },
          { status: 400 }
        );
      }
    } else {
      const invalidAllocation = parsed.allocations.find((a) => a.documentType !== "invoice");
      if (invalidAllocation) {
        return NextResponse.json(
          { error: "Incoming transactions can only be split across invoices" },
          { status: 400 }
        );
      }
    }

    // Verify all documents exist and are payable
    const documents: Array<{
      id: string;
      contactId: string;
      total: number;
      amountPaid: number;
      amountDue: number;
      type: "invoice" | "bill";
    }> = [];

    for (const allocation of parsed.allocations) {
      if (allocation.documentType === "bill") {
        const found = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, allocation.documentId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });
        if (!found) return notFound("Bill");
        if (found.status === "draft" || found.status === "void") {
          return NextResponse.json(
            { error: `Cannot record payment for bill ${found.billNumber} with status "${found.status}"` },
            { status: 400 }
          );
        }
        documents.push({
          id: found.id,
          contactId: found.contactId,
          total: found.total,
          amountPaid: found.amountPaid,
          amountDue: found.amountDue,
          type: "bill",
        });
      } else {
        const found = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, allocation.documentId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        if (!found) return notFound("Invoice");
        if (found.status === "draft" || found.status === "void") {
          return NextResponse.json(
            { error: `Cannot record payment for invoice ${found.invoiceNumber} with status "${found.status}"` },
            { status: 400 }
          );
        }
        documents.push({
          id: found.id,
          contactId: found.contactId,
          total: found.total,
          amountPaid: found.amountPaid,
          amountDue: found.amountDue,
          type: "invoice",
        });
      }
    }

    // Generate one payment number
    const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

    // Create one payment record
    const paymentType = isOutgoing ? "made" : "received";
    const [created] = await db
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: documents[0].contactId,
        paymentNumber,
        type: paymentType,
        date: parsed.date,
        amount: totalAllocated,
        method: parsed.method,
        bankAccountId: account.id,
        bankTransactionId: id,
        createdBy: ctx.userId,
      })
      .returning();

    // Create payment allocations and update documents
    const results: Array<{
      documentType: string;
      documentId: string;
      amount: number;
      newStatus: string;
    }> = [];

    for (let i = 0; i < parsed.allocations.length; i++) {
      const allocation = parsed.allocations[i];
      const doc = documents[i];

      // Create allocation record
      await db.insert(paymentAllocation).values({
        paymentId: created.id,
        documentType: allocation.documentType,
        documentId: allocation.documentId,
        amount: allocation.amount,
      });

      // Update document amounts
      const newAmountPaid = doc.amountPaid + allocation.amount;
      const newAmountDue = doc.total - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? "paid" : "partial";

      if (allocation.documentType === "bill") {
        await db
          .update(bill)
          .set({
            amountPaid: newAmountPaid,
            amountDue: Math.max(0, newAmountDue),
            status: newStatus,
            paidAt: newStatus === "paid" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(bill.id, allocation.documentId));
      } else {
        await db
          .update(invoice)
          .set({
            amountPaid: newAmountPaid,
            amountDue: Math.max(0, newAmountDue),
            status: newStatus,
            paidAt: newStatus === "paid" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(invoice.id, allocation.documentId));
      }

      results.push({
        documentType: allocation.documentType,
        documentId: allocation.documentId,
        amount: allocation.amount,
        newStatus,
      });
    }

    // Create one journal entry for the total amount
    const journalType = isOutgoing ? "bill" : "invoice";
    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      { type: journalType, reference: paymentNumber, amount: totalAllocated, date: parsed.date }
    );
    if (journalEntry) {
      await db.update(payment).set({ journalEntryId: journalEntry.id }).where(eq(payment.id, created.id));
    }

    // Mark transaction as reconciled
    await db
      .update(bankTransaction)
      .set({
        status: "reconciled",
        journalEntryId: journalEntry?.id || null,
      })
      .where(eq(bankTransaction.id, id));

    // Audit log
    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "split_matched",
      entityType: "bank_transaction",
      entityId: id,
      changes: { allocations: parsed.allocations, paymentId: created.id },
    });

    return NextResponse.json({
      payment: { id: created.id, paymentNumber },
      allocations: results,
    });
  } catch (err) {
    return handleError(err);
  }
}
