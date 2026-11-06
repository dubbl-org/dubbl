import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { submitForApproval } from "@/lib/approvals/entities";

// Send a draft invoice into the approval workflow: draft -> pending_approval,
// creating an approval_request (entityType "invoice") that approvers act on.
// Fails when no active workflow matches the invoice.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const outcome = await submitForApproval(ctx, "invoice", id);

    logAudit({
      ctx,
      action: "submit_for_approval",
      entityType: "invoice",
      entityId: id,
      changes: { previousStatus: "draft" },
      request,
    });

    return NextResponse.json({ invoice: outcome.entity, request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
