import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, invoice, payment, paymentAllocation, auditLog } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { findMatches, type MatchCandidate } from "@/lib/banking/reconciliation-matcher";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

// GET: Find potential invoice matches for an incoming bank transaction
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Find the transaction and verify ownership
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

    // Only works for incoming transactions (positive amount)
    const isIncoming = transaction.amount > 0;

    if (!isIncoming) {
      return NextResponse.json({
        transaction: {
          id: transaction.id,
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount,
          reference: transaction.reference,
        },
        suggestedMatches: [],
        openInvoices: [],
      });
    }

    // Find invoices with outstanding amounts
    const openInvoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt),
        inArray(invoice.status, ["sent", "partial", "overdue"])
      ),
      with: { contact: true },
      limit: 50,
    });

    // Use the reconciliation matcher
    const invoiceCandidates: MatchCandidate[] = openInvoices.map((inv) => ({
      type: "invoice" as const,
      id: inv.id,
      date: inv.dueDate,
      description: `${inv.invoiceNumber} - ${inv.contact?.name || "Unknown"}`,
      amount: inv.amountDue, // positive to match incoming transaction
      reference: inv.reference || inv.invoiceNumber,
    }));

    const matches = findMatches(
      {
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        reference: transaction.reference,
      },
      [],
      invoiceCandidates,
      []
    );

    // Also return all open invoices for manual selection
    const allOpenInvoices = openInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      contactName: inv.contact?.name || "Unknown",
      dueDate: inv.dueDate,
      total: inv.total,
      amountDue: inv.amountDue,
      status: inv.status,
    }));

    return NextResponse.json({
      transaction: {
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        reference: transaction.reference,
      },
      suggestedMatches: matches,
      openInvoices: allOpenInvoices,
    });
  } catch (err) {
    return handleError(err);
  }
}

// POST: Match a bank transaction to an invoice (record received payment + reconcile)
const matchInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().int().min(1), // cents
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
    const parsed = matchInvoiceSchema.parse(body);

    // Verify transaction
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

    // Verify invoice
    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, parsed.invoiceId),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });
    if (!found) return notFound("Invoice");
    if (found.status === "draft" || found.status === "void") {
      return NextResponse.json({ error: "Cannot record payment for this invoice status" }, { status: 400 });
    }

    // Generate payment number
    const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

    const [created] = await db
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        paymentNumber,
        type: "received",
        date: parsed.date,
        amount: parsed.amount,
        method: parsed.method,
        bankAccountId: account.id,
        bankTransactionId: id,
        createdBy: ctx.userId,
      })
      .returning();

    // Create allocation
    await db.insert(paymentAllocation).values({
      paymentId: created.id,
      documentType: "invoice",
      documentId: parsed.invoiceId,
      amount: parsed.amount,
    });

    // Create journal entry (DR Bank, CR AR)
    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      { type: "invoice", reference: paymentNumber, amount: parsed.amount, date: parsed.date }
    );
    if (journalEntry) {
      await db.update(payment).set({ journalEntryId: journalEntry.id }).where(eq(payment.id, created.id));
    }

    // Update invoice amounts
    const newAmountPaid = found.amountPaid + parsed.amount;
    const newAmountDue = found.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial";

    await db
      .update(invoice)
      .set({
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: newStatus,
        paidAt: newStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, parsed.invoiceId));

    // Mark bank transaction as reconciled
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
      action: "matched_invoice",
      entityType: "bank_transaction",
      entityId: id,
      changes: { invoiceId: parsed.invoiceId, paymentId: created.id, amount: parsed.amount },
    });

    return NextResponse.json({
      payment: { id: created.id, paymentNumber },
      invoiceStatus: newStatus,
    });
  } catch (err) {
    return handleError(err);
  }
}
