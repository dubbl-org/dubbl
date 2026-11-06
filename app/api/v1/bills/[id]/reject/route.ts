import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { rejectEntity } from "@/lib/approvals/entities";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

// Reject a bill that is pending approval (requires approve:bills): it goes
// back to draft with the reason recorded. When an approval workflow applies,
// only the current step's approver can reject, and the request is rejected.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body);

    const outcome = await rejectEntity(ctx, "bill", id, parsed.reason);

    logAudit({ ctx, action: "reject", entityType: "bill", entityId: id, changes: { previousStatus: "pending_approval" }, request });

    return NextResponse.json({ bill: outcome.entity, request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
