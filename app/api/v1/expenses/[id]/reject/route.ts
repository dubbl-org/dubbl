import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { rejectEntity } from "@/lib/approvals/entities";

const rejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

// Reject a submitted claim with a reason (requires approve:expenses). When an
// approval workflow applies, only the current step's approver can reject.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = rejectSchema.parse(body);

    const outcome = await rejectEntity(ctx, "expense", id, parsed.reason);

    logAudit({ ctx, action: "reject", entityType: "expense", entityId: id, changes: { previousStatus: "submitted" }, request });

    return NextResponse.json({ expenseClaim: outcome.entity, request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
