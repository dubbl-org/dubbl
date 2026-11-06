import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { processContractorPayment } from "@/lib/api/contractor-payments";

/** Pay a pending contractor payment and post it. See lib/api/contractor-payments.ts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const payment = await processContractorPayment(ctx, id, paymentId);

    logAudit({ ctx, action: "process", entityType: "contractorPayment", entityId: paymentId, request });

    return ok({ payment });
  } catch (err) {
    return handleError(err);
  }
}
