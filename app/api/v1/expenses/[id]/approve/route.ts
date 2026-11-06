import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { approveEntity } from "@/lib/approvals/entities";

const approveSchema = z.object({
  comment: z.string().optional(),
});

// Approve a submitted claim (requires approve:expenses). Full approval posts
// the approval entry (DR expense accounts / CR Employee Reimbursements
// Payable, dated today) and flips the claim to approved atomically. When an
// approval workflow applies, only the current step's approver can act and the
// claim posts only after the last step.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = approveSchema.parse(body);

    const outcome = await approveEntity(ctx, "expense", id, parsed.comment);

    logAudit({ ctx, action: "approve", entityType: "expense", entityId: id, changes: { previousStatus: "submitted", posted: outcome.finalized }, request });

    return NextResponse.json({ expenseClaim: outcome.entity, request: outcome.request, finalized: outcome.finalized });
  } catch (err) {
    return handleError(err);
  }
}
