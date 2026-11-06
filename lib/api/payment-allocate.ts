import { db } from "@/lib/db";
import { bill, invoice, payment, paymentAllocation } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { emitInvoicePaid } from "@/lib/webhooks/events";

export class PaymentAllocationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const OPEN_INVOICE_STATUSES = ["sent", "partial", "overdue"];
const OPEN_BILL_STATUSES = ["received", "partial", "overdue"];

/**
 * Put the unapplied part of an existing payment toward an open invoice
 * (received payments) or bill (made payments).
 *
 * The cash was already booked in full when the payment was recorded (DR Bank /
 * CR Accounts Receivable for the whole amount, or DR Accounts Payable / CR Bank),
 * so this is a pure open-item match: it adds an allocation row and updates the
 * document's paid/due/status. It posts NO journal entry and creates no new
 * payment, so the cash is never counted twice. `amount` is integer cents.
 */
export async function allocateUnappliedPayment(
  organizationId: string,
  paymentId: string,
  input: { documentId: string; amount: number }
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new PaymentAllocationError("Amount must be a positive whole number of cents");
  }

  const pmt = await db.query.payment.findFirst({
    where: and(eq(payment.id, paymentId), eq(payment.organizationId, organizationId), notDeleted(payment.deletedAt)),
    with: { allocations: true },
  });
  if (!pmt) throw new PaymentAllocationError("Payment not found", 404);
  // Credit-note / prepayment carriers aren't cash and have nothing to spread.
  if (!pmt.journalEntryId || pmt.allocations.some((a) => !["invoice", "bill"].includes(a.documentType))) {
    throw new PaymentAllocationError("This payment has no unapplied money to allocate");
  }

  const unapplied = pmt.amount - pmt.allocations.reduce((s, a) => s + a.amount, 0);
  if (unapplied <= 0) throw new PaymentAllocationError("This payment has no unapplied money left");
  if (input.amount > unapplied) {
    throw new PaymentAllocationError("That's more than the payment has left to apply");
  }

  const documentType = pmt.type === "received" ? "invoice" : "bill";

  // Older invoice payments were saved with the column default ("USD") rather
  // than the invoice's currency, so trust the documents it already pays.
  let paymentCurrency = pmt.currencyCode;
  const firstDocId = pmt.allocations[0]?.documentId;
  if (firstDocId) {
    const firstDoc = documentType === "invoice"
      ? await db.query.invoice.findFirst({ where: eq(invoice.id, firstDocId), columns: { currencyCode: true } })
      : await db.query.bill.findFirst({ where: eq(bill.id, firstDocId), columns: { currencyCode: true } });
    if (firstDoc) paymentCurrency = firstDoc.currencyCode;
  }

  const result = await db.transaction(async (tx) => {
    if (documentType === "invoice") {
      const doc = await tx.query.invoice.findFirst({
        where: and(eq(invoice.id, input.documentId), eq(invoice.organizationId, organizationId), notDeleted(invoice.deletedAt)),
      });
      if (!doc) throw new PaymentAllocationError("Invoice not found", 404);
      if (doc.contactId !== pmt.contactId) throw new PaymentAllocationError("The invoice belongs to a different customer");
      if (doc.currencyCode !== paymentCurrency) throw new PaymentAllocationError("The invoice is in a different currency");
      if (!OPEN_INVOICE_STATUSES.includes(doc.status)) throw new PaymentAllocationError("Only open invoices can be paid");
      if (input.amount > doc.amountDue) throw new PaymentAllocationError("That's more than this invoice still needs");

      const amountDue = doc.amountDue - input.amount;
      await tx.update(invoice).set({
        amountPaid: doc.amountPaid + input.amount,
        amountDue,
        status: amountDue <= 0 ? "paid" : "partial",
        paidAt: amountDue <= 0 ? new Date() : doc.paidAt,
        updatedAt: new Date(),
      }).where(eq(invoice.id, doc.id));
    } else {
      const doc = await tx.query.bill.findFirst({
        where: and(eq(bill.id, input.documentId), eq(bill.organizationId, organizationId), notDeleted(bill.deletedAt)),
      });
      if (!doc) throw new PaymentAllocationError("Bill not found", 404);
      if (doc.contactId !== pmt.contactId) throw new PaymentAllocationError("The bill belongs to a different supplier");
      if (doc.currencyCode !== paymentCurrency) throw new PaymentAllocationError("The bill is in a different currency");
      if (!OPEN_BILL_STATUSES.includes(doc.status)) throw new PaymentAllocationError("Only open bills can be paid");
      if (input.amount > doc.amountDue) throw new PaymentAllocationError("That's more than this bill still needs");

      const amountDue = doc.amountDue - input.amount;
      await tx.update(bill).set({
        amountPaid: doc.amountPaid + input.amount,
        amountDue,
        status: amountDue <= 0 ? "paid" : "partial",
        updatedAt: new Date(),
      }).where(eq(bill.id, doc.id));
    }

    // Lock the payment row so two allocations can't overspend it at once.
    const [locked] = await tx.select({ amount: payment.amount }).from(payment).where(eq(payment.id, pmt.id)).for("update");
    const current = await tx.select({ amount: paymentAllocation.amount }).from(paymentAllocation).where(eq(paymentAllocation.paymentId, pmt.id));
    if (input.amount > locked.amount - current.reduce((s, a) => s + a.amount, 0)) {
      throw new PaymentAllocationError("That's more than the payment has left to apply", 409);
    }

    const [allocation] = await tx
      .insert(paymentAllocation)
      .values({ paymentId: pmt.id, documentType, documentId: input.documentId, amount: input.amount })
      .returning();

    return {
      allocation,
      unapplied: unapplied - input.amount,
    };
  });
  // Sent after commit, and only if the invoice is now fully paid.
  if (documentType === "invoice") emitInvoicePaid(organizationId, [input.documentId]);
  return result;
}
