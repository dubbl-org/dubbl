import { db } from "@/lib/db";
import { creditNote, customerCredit, debitNote, payment } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Allocation types that mark a payment row as a carrier for a credit being
 * used (credit note, customer prepayment or supplier credit applied to a
 * document) rather than money in or out of the bank.
 */
export const CREDIT_ALLOCATION_TYPES = ["credit_note", "prepayment", "debit_note"] as const;

/**
 * WHERE condition: the payment is real money, not a credit-application
 * carrier. Used by the Payments lists so credit notes and prepayments applied
 * to invoices don't show up as payments received.
 */
export function isCashPayment() {
  return sql`not exists (select 1 from payment_allocation pa where pa.payment_id = ${payment.id} and pa.document_type in ('credit_note', 'prepayment', 'debit_note'))`;
}

/**
 * When a carrier payment is deleted, give the credit back to the credit note,
 * prepayment or supplier credit it came from, so it can be used again. The
 * invoice/bill side is restored by the caller's normal allocation unwind.
 * Voided (or refunded) credits are left alone.
 */
export async function restoreAppliedCredits(
  tx: Tx,
  organizationId: string,
  allocations: { documentType: string; documentId: string; amount: number }[]
) {
  for (const alloc of allocations) {
    if (alloc.documentType === "credit_note") {
      const cn = await tx.query.creditNote.findFirst({
        where: and(eq(creditNote.id, alloc.documentId), eq(creditNote.organizationId, organizationId)),
      });
      if (cn && cn.status !== "void") {
        await tx
          .update(creditNote)
          .set({
            amountApplied: Math.max(0, cn.amountApplied - alloc.amount),
            amountRemaining: cn.amountRemaining + alloc.amount,
            status: "sent",
            updatedAt: new Date(),
          })
          .where(eq(creditNote.id, cn.id));
      }
    } else if (alloc.documentType === "prepayment") {
      const cc = await tx.query.customerCredit.findFirst({
        where: and(eq(customerCredit.id, alloc.documentId), eq(customerCredit.organizationId, organizationId)),
      });
      if (cc && cc.status !== "void" && cc.status !== "refunded") {
        await tx
          .update(customerCredit)
          .set({ amountRemaining: cc.amountRemaining + alloc.amount, status: "open", updatedAt: new Date() })
          .where(eq(customerCredit.id, cc.id));
      }
    } else if (alloc.documentType === "debit_note") {
      const dn = await tx.query.debitNote.findFirst({
        where: and(eq(debitNote.id, alloc.documentId), eq(debitNote.organizationId, organizationId)),
      });
      if (dn && dn.status !== "void") {
        await tx
          .update(debitNote)
          .set({
            amountApplied: Math.max(0, dn.amountApplied - alloc.amount),
            amountRemaining: dn.amountRemaining + alloc.amount,
            status: "sent",
            updatedAt: new Date(),
          })
          .where(eq(debitNote.id, dn.id));
      }
    }
  }
}
