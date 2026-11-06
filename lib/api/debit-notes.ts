import { db } from "@/lib/db";
import { bill, debitNote, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import {
  billBalancesAfterApply,
  billBalancesAfterUnapply,
  sumByDocument,
} from "@/lib/api/debit-note-balances";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Apply and void for supplier credits (debit notes), shared by the REST routes
 * and the MCP tools so both behave the same. All amounts are integer cents.
 */

/** A rule violation the caller should show as-is (`status` is the HTTP code). */
export class DebitNoteError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "DebitNoteError";
  }
}

// A credit can only offset a bill that is in the books (posted to AP).
const APPLICABLE_BILL_STATUSES = ["received", "partial", "overdue"];

/**
 * Apply `amount` of a sent supplier credit to one of the same supplier's bills.
 *
 * No journal entry is posted: sending the credit already debited Accounts
 * Payable once, so using it against a bill is purely an open-item offset. The
 * application is recorded as a zero-cash carrier `payment` (type 'made') with
 * two allocations: a `debit_note` allocation pointing at the credit and a
 * `bill` allocation pointing at the bill. Statements exclude those carriers,
 * aged payables use the bill allocation, and voiding the credit uses them to
 * give the amount back to each bill.
 */
export async function applyDebitNote(
  ctx: AuthContext,
  id: string,
  billId: string,
  amount: number
) {
  const found = await db.query.debitNote.findFirst({
    where: and(
      eq(debitNote.id, id),
      eq(debitNote.organizationId, ctx.organizationId),
      notDeleted(debitNote.deletedAt)
    ),
  });
  if (!found) throw new DebitNoteError("Debit note not found", 404);
  if (found.status !== "sent" && found.status !== "applied") {
    throw new DebitNoteError("Debit note must be sent before it can be applied");
  }
  if (amount > found.amountRemaining) {
    throw new DebitNoteError("Amount exceeds remaining debit note balance");
  }

  const foundBill = await db.query.bill.findFirst({
    where: and(
      eq(bill.id, billId),
      eq(bill.organizationId, ctx.organizationId),
      notDeleted(bill.deletedAt)
    ),
  });
  if (!foundBill) throw new DebitNoteError("Bill not found", 404);
  if (!APPLICABLE_BILL_STATUSES.includes(foundBill.status)) {
    throw new DebitNoteError(
      "A supplier credit can only be used against a bill that's in your books and not fully paid."
    );
  }
  // The debit note belongs to one supplier — applying it to another
  // supplier's bill would corrupt both suppliers' balances.
  if (foundBill.contactId !== found.contactId) {
    throw new DebitNoteError("This supplier credit belongs to a different supplier than the bill.");
  }
  // Amounts offset 1:1, so a currency mismatch would reduce the bill by the
  // wrong figure and break the tie between AP and the GL.
  if (foundBill.currencyCode !== found.currencyCode) {
    throw new DebitNoteError("The supplier credit and bill are in different currencies.");
  }
  if (amount > foundBill.amountDue) {
    throw new DebitNoteError("Amount exceeds the bill's outstanding balance");
  }

  const newAmountApplied = found.amountApplied + amount;
  const newAmountRemaining = Math.max(0, found.amountRemaining - amount);
  const dnStatus = newAmountRemaining <= 0 ? "applied" : "sent";
  const billAfter = billBalancesAfterApply(foundBill, amount);

  const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

  return db.transaction(async (tx) => {
    const [carrier] = await tx
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        paymentNumber,
        type: "made",
        date: new Date().toISOString().slice(0, 10),
        amount,
        method: "other",
        reference: found.debitNoteNumber,
        notes: `Supplier credit ${found.debitNoteNumber} applied to bill ${foundBill.billNumber}`,
        currencyCode: found.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(paymentAllocation).values([
      { paymentId: carrier.id, documentType: "debit_note", documentId: id, amount },
      { paymentId: carrier.id, documentType: "bill", documentId: billId, amount },
    ]);

    const [updatedDebitNote] = await tx
      .update(debitNote)
      .set({
        amountApplied: newAmountApplied,
        amountRemaining: newAmountRemaining,
        status: dnStatus,
        updatedAt: new Date(),
      })
      .where(eq(debitNote.id, id))
      .returning();

    const [updatedBill] = await tx
      .update(bill)
      .set({
        amountPaid: billAfter.amountPaid,
        amountDue: billAfter.amountDue,
        status: billAfter.status,
        paidAt: billAfter.status === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, billId))
      .returning();

    return { debitNote: updatedDebitNote, bill: updatedBill, previousStatus: found.status };
  });
}

/**
 * Void (cancel) a supplier credit and undo everything it did:
 * 1. If it was sent, post a reversing journal entry for the send posting
 *    (DR AP / CR expense / CR input tax becomes CR AP / DR expense / DR input
 *    tax), dated the credit's issue date. The issue date's period must be open.
 * 2. Give every amount it settled back to the bills (amountPaid / amountDue /
 *    status) and delete the carrier payments that recorded those applications
 *    (their allocations cascade).
 * 3. Mark it void with nothing applied and nothing left to use.
 */
export async function voidDebitNote(ctx: AuthContext, id: string) {
  const found = await db.query.debitNote.findFirst({
    where: and(
      eq(debitNote.id, id),
      eq(debitNote.organizationId, ctx.organizationId),
      notDeleted(debitNote.deletedAt)
    ),
  });
  if (!found) throw new DebitNoteError("Debit note not found", 404);
  if (found.status === "void") throw new DebitNoteError("Already voided");

  // Only a sent credit posted to the GL; a draft is a pure status flip.
  const wasPosted =
    (found.status === "sent" || found.status === "applied") && !!found.journalEntryId;
  if (wasPosted) {
    await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
  }

  const dnAllocations = await db.query.paymentAllocation.findMany({
    where: and(
      eq(paymentAllocation.documentType, "debit_note"),
      eq(paymentAllocation.documentId, id)
    ),
    with: { payment: true },
  });
  // Applications made before they were recorded as carrier payments can't be
  // traced to a bill, so they can't be given back automatically.
  const recorded = dnAllocations.reduce((s, a) => s + a.amount, 0);
  if (found.amountApplied > recorded) {
    throw new DebitNoteError(
      "Part of this supplier credit was used against a bill before dubbl recorded which bill, so it can't be cancelled automatically."
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const [updated] = await db.transaction(async (tx) => {
    if (wasPosted) {
      await reverseJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          entryId: found.journalEntryId as string,
          date: found.issueDate,
          description: `Void supplier credit ${found.debitNoteNumber}`,
          reference: found.debitNoteNumber,
          sourceType: "debit_note_void",
          sourceId: found.id,
        },
        tx
      );
    }

    // A carrier payment someone already deleted gave its amount back to the
    // bill at that point, so only live carriers are unwound here.
    const carrierPaymentIds = [
      ...new Set(dnAllocations.filter((a) => a.payment && !a.payment.deletedAt).map((a) => a.paymentId)),
    ];
    if (carrierPaymentIds.length > 0) {
      const billAllocations = await tx.query.paymentAllocation.findMany({
        where: and(
          inArray(paymentAllocation.paymentId, carrierPaymentIds),
          eq(paymentAllocation.documentType, "bill")
        ),
      });

      for (const [billId, applied] of sumByDocument(billAllocations)) {
        if (applied <= 0) continue;
        const target = await tx.query.bill.findFirst({
          where: and(eq(bill.id, billId), eq(bill.organizationId, ctx.organizationId)),
        });
        // A voided bill was settled to zero; don't resurrect its balance.
        if (!target || target.status === "void") continue;
        const after = billBalancesAfterUnapply(target, applied, today);
        await tx
          .update(bill)
          .set({
            amountPaid: after.amountPaid,
            amountDue: after.amountDue,
            status: after.status,
            paidAt: after.status === "paid" ? target.paidAt : null,
            updatedAt: new Date(),
          })
          .where(eq(bill.id, billId));
      }

      await tx
        .delete(payment)
        .where(
          and(
            inArray(payment.id, carrierPaymentIds),
            eq(payment.organizationId, ctx.organizationId)
          )
        );
    }

    return tx
      .update(debitNote)
      .set({
        status: "void",
        voidedAt: new Date(),
        amountApplied: 0,
        amountRemaining: 0,
        updatedAt: new Date(),
      })
      .where(eq(debitNote.id, id))
      .returning();
  });

  return { debitNote: updated, previousStatus: found.status };
}
