import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { rejectEntity } from "@/lib/approvals/entities";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

// Reject an invoice that is pending approval: records the rejection on the
// approval_request (with an optional reason) and moves the invoice to
// "rejected". Only the current step's approver can reject.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body);

    const outcome = await rejectEntity(ctx, "invoice", id, parsed.reason);

    logAudit({
      ctx,
      action: "reject",
      entityType: "invoice",
      entityId: id,
      changes: { previousStatus: "pending_approval" },
      request,
    });

    return NextResponse.json({ invoice: outcome.entity, request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
