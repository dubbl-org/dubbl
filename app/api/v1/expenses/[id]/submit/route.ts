import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { submitForApproval } from "@/lib/approvals/entities";

// Submit a draft claim, or re-submit a corrected rejected one (clearing the
// previous rejection so it returns to the approval queue clean). When an
// active approval workflow matches the claim, an approval request is opened
// for its approvers.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const outcome = await submitForApproval(ctx, "expense", id);

    logAudit({ ctx, action: "submit", entityType: "expense", entityId: id, request });

    return NextResponse.json({ expenseClaim: outcome.entity, request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
