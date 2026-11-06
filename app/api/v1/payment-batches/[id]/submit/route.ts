import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { BillPaymentError, submitPaymentBatch } from "@/lib/api/bill-payment";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    // Pays each item's bill from the batch's bank account, one transaction
    // per item (a failed item is marked failed and the rest carry on).
    const result = await submitPaymentBatch(ctx, id);
    if (!result) return notFound("Payment batch");

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BillPaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
