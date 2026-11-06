import { db } from "@/lib/db";
import {
  bill,
  payment,
  paymentAllocation,
  paymentBatch,
  paymentBatchItem,
  scheduledPayment,
} from "@/lib/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked, PeriodLockedError } from "@/lib/api/period-lock";
import { MissingExchangeRateError } from "@/lib/currency/converter";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";
import type { AuthContext } from "@/lib/api/auth-context";

/** A bill can't take this payment (not found, wrong status, overpaid, ...). */
export class BillPaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillPaymentError";
    this.status = status;
  }
}

/**
 * A message safe to show the user for a failed bill payment: the reason for
 * the errors we raise on purpose, a generic one for anything unexpected.
 */
export function billPaymentFailureMessage(err: unknown): string {
  if (
    err instanceof BillPaymentError ||
    err instanceof PeriodLockedError ||
    err instanceof MissingExchangeRateError
  ) {
    return err.message;
  }
  return "Payment failed";
}

export type BillPaymentInput = {
  billId: string;
  /** Integer cents, in the bill's currency. */
  amount: number;
  /** YYYY-MM-DD; the journal entry posts on this date. */
  date: string;
  method?: "bank_transfer" | "cash" | "check" | "card" | "other";
  reference?: string | null;
  notes?: string | null;
  /**
   * The bank account (bank_account row) the money leaves from. Null/omitted =
   * the default bank ledger account (1100).
   */
  bankAccountId?: string | null;
};

/**
 * Pay (part of) a bill: one payment record, its allocation, the GL entry
 * (DR Accounts Payable / CR the chosen bank account's ledger account, with
 * realised FX for a foreign-currency bill) and the bill's balance/status, all
 * in one transaction. Shared by the single pay-bill route, payment batches,
 * scheduled payments and the MCP tools so they validate and post the same way.
 *
 * Throws BillPaymentError for a bill that can't take the payment, and lets
 * PeriodLockedError / MissingExchangeRateError propagate.
 */
export async function recordBillPayment(ctx: AuthContext, input: BillPaymentInput) {
  const found = await db.query.bill.findFirst({
    where: and(
      eq(bill.id, input.billId),
      eq(bill.organizationId, ctx.organizationId),
      notDeleted(bill.deletedAt)
    ),
  });

  if (!found) throw new BillPaymentError("Bill not found", 404);
  if (found.status === "draft" || found.status === "void" || found.status === "pending_approval") {
    throw new BillPaymentError("Cannot record payment for this bill status");
  }
  // Don't accept more than is outstanding — an overpayment would drive the
  // balance negative and overstate cash out.
  if (input.amount > found.amountDue) {
    throw new BillPaymentError("Payment is more than the amount still due on this bill.");
  }
  if (input.bankAccountId) {
    const bankError = await checkPaymentBankAccount(ctx.organizationId, input.bankAccountId, [found.currencyCode]);
    if (bankError) throw new BillPaymentError(bankError);
  }
  // The payment posts a GL entry on input.date — block locked/closed periods.
  await assertNotLocked(ctx.organizationId, input.date, ctx);

  // Settle against the bill's OUTSTANDING balance (amountDue), not a fresh
  // total - paid. For reverse-charge bills the payable is the net only (the
  // self-accounted VAT never leaves the bank), so amountDue < total; deriving
  // the remainder from total left a phantom balance = the RC VAT and the bill
  // could never reach "paid".
  const newAmountPaid = found.amountPaid + input.amount;
  const newAmountDue = found.amountDue - input.amount;
  const newStatus = newAmountDue <= 0 ? "paid" : "partial";

  const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

  // Atomically write the payment, allocation, GL journal entry, the
  // payment->journalEntry link, and the bill balance/status update. If
  // createPaymentJournalEntry throws (e.g. MissingExchangeRateError), the
  // whole sequence rolls back so we never leave an orphaned payment or a
  // bill marked paid without a ledger entry.
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        paymentNumber,
        type: "made",
        date: input.date,
        amount: input.amount,
        currencyCode: found.currencyCode,
        method: input.method ?? "bank_transfer",
        reference: input.reference || null,
        notes: input.notes || null,
        bankAccountId: input.bankAccountId || null,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(paymentAllocation).values({
      paymentId: created.id,
      documentType: "bill",
      documentId: found.id,
      amount: input.amount,
    });

    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        type: "bill",
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
      await tx
        .update(payment)
        .set({ journalEntryId: journalEntry.id })
        .where(eq(payment.id, created.id));
    }

    const [updated] = await tx
      .update(bill)
      .set({
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: newStatus,
        paidAt: newStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, found.id))
      .returning();

    return {
      bill: updated,
      previousStatus: found.status,
      payment: { ...created, journalEntryId: journalEntry?.id ?? null },
    };
  });
}

/**
 * Submit a draft payment batch: pay each item's bill from the batch's bank
 * account (today's date), marking items completed or failed, then mark the
 * batch completed. Each item runs in its own transaction, so one failure
 * (bill no longer due, period locked, missing FX rate, ...) doesn't stop the
 * rest. Returns null when the batch doesn't exist, and throws
 * BillPaymentError when it isn't a draft (including when another request
 * submitted it first, so a double click can't pay twice).
 */
export async function submitPaymentBatch(ctx: AuthContext, batchId: string) {
  const existing = await db.query.paymentBatch.findFirst({
    where: and(
      eq(paymentBatch.id, batchId),
      eq(paymentBatch.organizationId, ctx.organizationId),
      notDeleted(paymentBatch.deletedAt)
    ),
    with: { items: true },
  });
  if (!existing) return null;

  // Claim the batch: only one request can move it out of draft.
  const [claimed] = await db
    .update(paymentBatch)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(and(eq(paymentBatch.id, batchId), eq(paymentBatch.status, "draft")))
    .returning({ id: paymentBatch.id });
  if (!claimed) throw new BillPaymentError("Only draft batches can be submitted");

  const today = new Date().toISOString().split("T")[0];
  let processed = 0;
  // Why each failed item failed, so the caller can tell the user.
  const failures: { itemId: string; billId: string; error: string }[] = [];

  for (const item of existing.items) {
    const billId = item.billId;
    if (!billId) continue;

    try {
      await recordBillPayment(ctx, {
        billId,
        amount: item.amount,
        date: today,
        method: "bank_transfer",
        bankAccountId: existing.bankAccountId,
      });
      await db
        .update(paymentBatchItem)
        .set({ status: "completed" })
        .where(eq(paymentBatchItem.id, item.id));
      processed++;
    } catch (err) {
      // The item's payment tx rolled back (no orphaned writes).
      console.error(`Failed to process payment batch item ${item.id}:`, err);
      failures.push({ itemId: item.id, billId, error: billPaymentFailureMessage(err) });
      await db
        .update(paymentBatchItem)
        .set({ status: "failed" })
        .where(eq(paymentBatchItem.id, item.id));
    }
  }

  await db
    .update(paymentBatch)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(paymentBatch.id, batchId));

  const batch = await db.query.paymentBatch.findFirst({
    where: eq(paymentBatch.id, batchId),
    with: {
      items: { with: { bill: { with: { contact: true } }, contact: true } },
      bankAccount: { columns: { id: true, accountName: true, currencyCode: true } },
    },
  });

  return { batch, processed, total: existing.items.length, failures };
}

/**
 * Pay every pending scheduled payment that is due (scheduled date on or
 * before today, UTC), each on its scheduled date from its chosen bank
 * account. Each payment runs in its own transaction; failures are marked
 * failed with the reason returned.
 */
export async function processDueScheduledPayments(ctx: AuthContext) {
  const today = new Date().toISOString().split("T")[0];

  const duePayments = await db.query.scheduledPayment.findMany({
    where: and(
      eq(scheduledPayment.organizationId, ctx.organizationId),
      eq(scheduledPayment.status, "pending"),
      lte(scheduledPayment.scheduledDate, today),
      notDeleted(scheduledPayment.deletedAt)
    ),
  });

  let processed = 0;
  // Why each failed payment failed, so the caller can tell the user.
  const failures: { scheduledPaymentId: string; billId: string; error: string }[] = [];

  for (const sp of duePayments) {
    const billId = sp.billId;
    if (!billId) continue;

    // Claim it: a concurrent run that already picked it up skips it.
    const [claimed] = await db
      .update(scheduledPayment)
      .set({ status: "processing", updatedAt: new Date() })
      .where(and(eq(scheduledPayment.id, sp.id), eq(scheduledPayment.status, "pending")))
      .returning({ id: scheduledPayment.id });
    if (!claimed) continue;

    try {
      await recordBillPayment(ctx, {
        billId,
        amount: sp.amount,
        date: sp.scheduledDate,
        method: "bank_transfer",
        notes: sp.notes,
        bankAccountId: sp.bankAccountId,
      });
      await db
        .update(scheduledPayment)
        .set({ status: "completed", processedAt: new Date(), updatedAt: new Date() })
        .where(eq(scheduledPayment.id, sp.id));
      processed++;
    } catch (err) {
      // The payment tx rolled back; already-processed items stay committed.
      console.error(`Failed to process scheduled payment ${sp.id}:`, err);
      failures.push({ scheduledPaymentId: sp.id, billId, error: billPaymentFailureMessage(err) });
      await db
        .update(scheduledPayment)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(scheduledPayment.id, sp.id));
    }
  }

  return { processed, total: duePayments.length, failures };
}
