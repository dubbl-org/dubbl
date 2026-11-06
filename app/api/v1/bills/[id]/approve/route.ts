import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { approveEntity } from "@/lib/approvals/entities";
import { ProcurementBlockedError } from "../../_procurement";

const approveSchema = z.object({
  comment: z.string().optional(),
});

// Approve a bill that is pending approval (requires approve:bills). When an
// approval workflow applies, only the current step's approver can act and the
// bill posts to the ledger only after the last step approves; otherwise the
// bill posts straight away.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = approveSchema.parse(body);

    const outcome = await approveEntity(ctx, "bill", id, parsed.comment);

    logAudit({
      ctx,
      action: "approve",
      entityType: "bill",
      entityId: id,
      changes: { previousStatus: "pending_approval", posted: outcome.finalized },
      request,
    });

    return NextResponse.json({
      bill: outcome.entity,
      request: outcome.request,
      finalized: outcome.finalized,
      grniEntryId: outcome.grniEntryId ?? null,
      warnings: outcome.warnings ?? [],
    });
  } catch (err) {
    if (err instanceof ProcurementBlockedError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 422 });
    }
    return handleError(err);
  }
}
