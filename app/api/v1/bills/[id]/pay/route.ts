import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { requireRole } from "@/lib/api/require-role";
import { BillPaymentError, recordBillPayment } from "@/lib/api/bill-payment";
import { z } from "zod";

const paySchema = z.object({
  amount: z.number().int().min(1),
  date: z.string().min(1),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
  reference: z.string().nullable().optional(),
  // The bank account (bank_account row) the money leaves from. Omitted = the
  // default bank ledger account (1100).
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

    // Validates the bill / amount / bank account / period lock, then writes
    // the payment, allocation, GL entry and bill balance in one transaction.
    const { bill: updated, payment: created, previousStatus } = await recordBillPayment(ctx, {
      billId: id,
      amount: parsed.amount,
      date: parsed.date,
      method: parsed.method,
      reference: parsed.reference,
      bankAccountId: parsed.bankAccountId,
    });

    logAudit({ ctx, action: "pay", entityType: "bill", entityId: id, changes: { previousStatus }, request });

    return NextResponse.json({
      bill: updated,
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
    if (err instanceof BillPaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
