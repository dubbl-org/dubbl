import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, bill, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { findMatches, type MatchCandidate } from "@/lib/banking/reconciliation-matcher";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { z } from "zod";

// GET: Find potential matches for a bank transaction
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

    // For outgoing transactions (negative amount), find open bills
    // For incoming transactions (positive amount), find open invoices
    const isOutgoing = transaction.amount < 0;

    if (isOutgoing) {
      // Find bills with outstanding amounts
      const openBills = await db.query.bill.findMany({
        where: and(
          eq(bill.organizationId, ctx.organizationId),
          notDeleted(bill.deletedAt),
          inArray(bill.status, ["received", "partial", "overdue"])
        ),
        with: { contact: true },
        limit: 50,
      });

      // Use the reconciliation matcher
      const billCandidates: MatchCandidate[] = openBills.map((b) => ({
        type: "bill" as const,
        id: b.id,
        date: b.dueDate,
        description: `${b.billNumber} - ${b.contact?.name || "Unknown"}`,
        amount: -b.amountDue, // negative to match outgoing transaction
        reference: b.reference || b.billNumber,
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
        billCandidates,
        []
      );

      // Also return all open bills for manual selection (in case matcher doesn't find good matches)
      const allOpenBills = openBills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        contactName: b.contact?.name || "Unknown",
        dueDate: b.dueDate,
        total: b.total,
        amountDue: b.amountDue,
        status: b.status,
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
        openBills: allOpenBills,
      });
    }

    // For incoming transactions, we could match against invoices but that's for sales
    return NextResponse.json({
      transaction: {
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        reference: transaction.reference,
      },
      suggestedMatches: [],
      openBills: [],
    });
  } catch (err) {
    return handleError(err);
  }
}

// POST: Match a bank transaction to a bill (record payment + reconcile)
const matchSchema = z.object({
  billId: z.string().min(1),
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
    const parsed = matchSchema.parse(body);

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

    // Verify bill
    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, parsed.billId),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });
    if (!found) return notFound("Bill");
    if (found.status === "draft" || found.status === "void") {
      return NextResponse.json({ error: "Cannot record payment for this bill status" }, { status: 400 });
    }

    // Create payment record
    const [maxResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payment)
      .where(eq(payment.organizationId, ctx.organizationId));
    const next = (Number(maxResult?.count) || 0) + 1;
    const paymentNumber = `PAY-${next.toString().padStart(5, "0")}`;

    const [created] = await db
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        paymentNumber,
        type: "made",
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
      documentType: "bill",
      documentId: parsed.billId,
      amount: parsed.amount,
    });

    // Create journal entry
    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      { type: "bill", reference: paymentNumber, amount: parsed.amount, date: parsed.date }
    );
    if (journalEntry) {
      await db.update(payment).set({ journalEntryId: journalEntry.id }).where(eq(payment.id, created.id));
    }

    // Update bill amounts
    const newAmountPaid = found.amountPaid + parsed.amount;
    const newAmountDue = found.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial";

    await db
      .update(bill)
      .set({
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: newStatus,
        paidAt: newStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, parsed.billId));

    // Mark bank transaction as reconciled
    await db
      .update(bankTransaction)
      .set({
        status: "reconciled",
        journalEntryId: journalEntry?.id || null,
      })
      .where(eq(bankTransaction.id, id));

    return NextResponse.json({
      payment: { id: created.id, paymentNumber },
      billStatus: newStatus,
    });
  } catch (err) {
    return handleError(err);
  }
}
