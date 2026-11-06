import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { InvoicePaymentError, recordInvoicePayment } from "@/lib/api/invoice-payment";
import { z } from "zod";
import { notifyPaymentReceived, notifySafely } from "@/lib/notifications/events";

const paySchema = z.object({
  amount: z.number().int().min(1),
  date: z.string().min(1),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
  reference: z.string().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = paySchema.parse(body);

    // Payment, allocation, journal entry (DR Bank / CR AR) and the invoice's
    // balance in one transaction; also checks status, amount and lock dates.
    const { invoice: updated, payment: created, previousStatus } = await recordInvoicePayment(ctx, {
      invoiceId: id,
      amount: parsed.amount,
      date: parsed.date,
      method: parsed.method,
      reference: parsed.reference,
      bankAccountId: parsed.bankAccountId,
    });

    await notifySafely(notifyPaymentReceived(ctx.organizationId, created.id, ctx.userId));
    logAudit({ ctx, action: "pay", entityType: "invoice", entityId: id, changes: { previousStatus }, request });

    return NextResponse.json({
      invoice: updated,
      payment: {
        id: created.id,
        paymentNumber: created.paymentNumber,
        date: created.date,
        amount: created.amount,
        method: created.method,
        bankAccountId: created.bankAccountId,
      },
    });
  } catch (err) {
    if (err instanceof InvoicePaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
