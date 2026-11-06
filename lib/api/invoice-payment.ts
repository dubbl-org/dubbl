import { db } from "@/lib/db";
import { invoice, payment, paymentAllocation } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked, PeriodLockedError } from "@/lib/api/period-lock";
import { MissingExchangeRateError } from "@/lib/currency/converter";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";
import { PaymentAllocationError } from "@/lib/api/payment-allocate";
import { emitPaymentReceived } from "@/lib/webhooks/events";
import type { AuthContext } from "@/lib/api/auth-context";

/** An invoice can't take this payment (not found, wrong status, overpaid, bad bank account). */
export class InvoicePaymentError extends PaymentAllocationError {}

// Drafts, voided invoices and ones waiting for (or refused) approval aren't
// owed yet, so there is nothing to pay.
const UNPAYABLE_STATUSES = ["draft", "void", "pending_approval", "rejected"];

export type InvoicePaymentInput = {
  invoiceId: string;
  /** Integer cents, in the invoice's currency. */
  amount: number;
  /** YYYY-MM-DD; the journal entry posts on this date. */
  date: string;
  method?: "bank_transfer" | "cash" | "check" | "card" | "other";
  reference?: string | null;
  /** The bank account the money arrives in. Null/omitted = the default bank ledger account (1100). */
  bankAccountId?: string | null;
};

/**
 * Record money received against an invoice: one payment record (in the
 * invoice's currency), its allocation, the GL entry (DR the bank account's
 * ledger account / CR Accounts Receivable, with realised FX for a foreign
 * invoice) and the invoice's balance/status, all in one transaction. Shared by
 * the REST pay route and the MCP pay_invoice tool.
 *
 * Throws InvoicePaymentError for an invoice that can't take the payment, and
 * lets PeriodLockedError / MissingExchangeRateError propagate.
 */
export async function recordInvoicePayment(ctx: AuthContext, input: InvoicePaymentInput) {
  const found = await db.query.invoice.findFirst({
    where: and(
      eq(invoice.id, input.invoiceId),
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt)
    ),
  });

  if (!found) throw new InvoicePaymentError("Invoice not found", 404);
  if (UNPAYABLE_STATUSES.includes(found.status)) {
    throw new InvoicePaymentError("Cannot record payment for this invoice status");
  }
  // Don't accept more than is outstanding: an overpayment would drive the
  // balance negative and overstate cash received.
  if (input.amount > found.amountDue) {
    throw new InvoicePaymentError("Payment is more than the amount still due on this invoice.");
  }
  if (input.bankAccountId) {
    const bankError = await checkPaymentBankAccount(ctx.organizationId, input.bankAccountId, [found.currencyCode], "invoice");
    if (bankError) throw new InvoicePaymentError(bankError);
  }
  // The payment posts DR Bank / CR AR on input.date: block locked/closed periods.
  await assertNotLocked(ctx.organizationId, input.date, ctx);

  const newAmountPaid = found.amountPaid + input.amount;
  const newAmountDue = found.amountDue - input.amount;
  const newStatus = newAmountDue <= 0 ? "paid" : "partial";

  const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        paymentNumber,
        type: "received",
        date: input.date,
        amount: input.amount,
        currencyCode: found.currencyCode,
        method: input.method ?? "bank_transfer",
        reference: input.reference || null,
        bankAccountId: input.bankAccountId || null,
        createdBy: ctx.userId,
      })
      .returning();
    emitPaymentReceived(ctx.organizationId, [created.id]);

    await tx.insert(paymentAllocation).values({
      paymentId: created.id,
      documentType: "invoice",
      documentId: found.id,
      amount: input.amount,
    });

    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        type: "invoice",
        reference: paymentNumber,
        amount: input.amount,
        date: input.date,
        bankAccountId: created.bankAccountId,
        allocations: [
          {
            amount: input.amount,
            currencyCode: found.currencyCode,
            issueDate: found.issueDate,
          },
        ],
      },
      tx
    );

    if (journalEntry) {
      await tx.update(payment).set({ journalEntryId: journalEntry.id }).where(eq(payment.id, created.id));
    }

    const [updated] = await tx
      .update(invoice)
      .set({
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: newStatus,
        paidAt: newStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, found.id))
      .returning();

    return {
      invoice: updated,
      previousStatus: found.status,
      payment: { ...created, journalEntryId: journalEntry?.id ?? null },
    };
  });
}

/**
 * Mark several invoices paid in full: each open invoice gets a real payment
 * for what it still owes (same as recordInvoicePayment: payment record,
 * allocation, DR Bank / CR Accounts Receivable), dated `date`, into
 * `bankAccountId` or the default bank account. Each invoice is done on its
 * own, so one failure (draft, already paid, locked period, missing FX rate)
 * doesn't stop the rest. Ids outside the organization are reported as not found.
 */
export async function markInvoicesPaid(
  ctx: AuthContext,
  ids: string[],
  opts: { date?: string; bankAccountId?: string | null; method?: InvoicePaymentInput["method"] } = {}
) {
  const date = opts.date || new Date().toISOString().split("T")[0];
  const results: { id: string; success: boolean; paymentId?: string; error?: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const found = await db.query.invoice.findFirst({
        where: and(eq(invoice.id, id), eq(invoice.organizationId, ctx.organizationId), notDeleted(invoice.deletedAt)),
        columns: { amountDue: true, status: true },
      });
      if (!found) throw new InvoicePaymentError("Invoice not found", 404);
      if (found.status === "paid" || found.amountDue <= 0) throw new InvoicePaymentError("Already paid");
      const { payment: created } = await recordInvoicePayment(ctx, {
        invoiceId: id,
        amount: found.amountDue,
        date,
        method: opts.method,
        bankAccountId: opts.bankAccountId,
      });
      results.push({ id, success: true, paymentId: created.id });
    } catch (err) {
      const known = err instanceof InvoicePaymentError || err instanceof PeriodLockedError || err instanceof MissingExchangeRateError;
      if (!known) console.error(`Failed to mark invoice ${id} paid:`, err);
      results.push({ id, success: false, error: known ? (err as Error).message : "Payment failed" });
    }
  }
  return results;
}
