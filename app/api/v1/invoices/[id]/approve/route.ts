import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { approveEntity } from "@/lib/approvals/entities";
import { z } from "zod";

const approveSchema = z.object({
  comment: z.string().optional(),
});

// Approve an invoice that is pending approval. Records the approval action on
// the approval_request (only the current step's approver can act); once the
// workflow is fully approved the invoice returns to "draft" (ready to send).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json().catch(() => ({}));
    const parsed = approveSchema.parse(body);

    const outcome = await approveEntity(ctx, "invoice", id, parsed.comment);

    logAudit({
      ctx,
      action: "approve",
      entityType: "invoice",
      entityId: id,
      changes: { previousStatus: "pending_approval" },
      request,
    });

    return NextResponse.json({ invoice: outcome.entity, request: outcome.request, finalized: outcome.finalized });
  } catch (err) {
    return handleError(err);
  }
}
