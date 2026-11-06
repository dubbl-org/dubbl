import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { allocateUnappliedPayment, PaymentAllocationError } from "@/lib/api/payment-allocate";
import { z } from "zod";

const schema = z.object({
  // The invoice (received payments) or bill (made payments) to settle.
  documentId: z.string().uuid(),
  // Integer cents, at most the payment's unapplied amount and the document's amount due.
  amount: z.number().int().positive(),
});

/**
 * POST /api/v1/payments/[id]/allocate
 *
 * Put a payment's unapplied money toward an open invoice/bill of the same
 * contact and currency. Matching only: the cash was booked when the payment was
 * recorded, so no journal entry or new payment is created.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const parsed = schema.parse(await request.json());
    const result = await allocateUnappliedPayment(ctx.organizationId, id, parsed);

    logAudit({ ctx, action: "update", entityType: "payment", entityId: id, changes: { allocated: parsed }, request });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PaymentAllocationError) return error(err.message, err.status);
    return handleError(err);
  }
}
