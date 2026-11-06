import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { submitForApproval } from "@/lib/approvals/entities";

// Send a draft journal entry to its approval workflow. Opens an approval
// request for the workflow's approvers; the entry stays a draft and can be
// posted once the last step approves. Fails when no active workflow matches.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const outcome = await submitForApproval(ctx, "journal_entry", id);

    logAudit({ ctx, action: "submit_for_approval", entityType: "journal_entry", entityId: id, request });

    return NextResponse.json({ request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
