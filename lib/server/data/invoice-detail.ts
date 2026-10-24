import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice, paymentAllocation } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";
import { toBaseAmounts } from "@/lib/currency/base-amount";

/** One invoice with its lines, its contact and the payments applied to it. */
export async function getInvoiceDetail(organizationId: string, invoiceId: string) {
  const found = await db.query.invoice.findFirst({
    where: and(
      eq(invoice.id, invoiceId),
      eq(invoice.organizationId, organizationId),
      notDeleted(invoice.deletedAt)
    ),
    with: {
      contact: true,
      lines: { with: { account: true, taxRate: true } },
    },
  });
  if (!found) return null;

  const allocations = await db.query.paymentAllocation.findMany({
    where: and(
      eq(paymentAllocation.documentType, "invoice"),
      eq(paymentAllocation.documentId, invoiceId)
    ),
    with: { payment: true },
  });

  const payments = allocations
    .filter((a) => a.payment)
    .map((a) => ({
      id: a.payment.id,
      paymentNumber: a.payment.paymentNumber,
      date: a.payment.date,
      amount: a.amount,
      method: a.payment.method,
    }));

  const base = await toBaseAmounts(
    organizationId,
    found.currencyCode,
    found.issueDate,
    {
      total: found.total,
      amountDue: found.amountDue,
      amountPaid: found.amountPaid,
      subtotal: found.subtotal,
      taxTotal: found.taxTotal,
    }
  );

  return { invoice: found, payments, base };
}
