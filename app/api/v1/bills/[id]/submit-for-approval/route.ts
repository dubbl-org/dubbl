import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { submitForApproval } from "@/lib/approvals/entities";

// Send a draft bill for approval: draft -> pending_approval. When an active
// approval workflow matches the bill an approval_request is opened for its
// approvers; otherwise anyone with approve:bills can approve it.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const outcome = await submitForApproval(ctx, "bill", id);

    logAudit({ ctx, action: "submit_for_approval", entityType: "bill", entityId: id, changes: { previousStatus: "draft" }, request });

    return NextResponse.json({ bill: outcome.entity, request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
