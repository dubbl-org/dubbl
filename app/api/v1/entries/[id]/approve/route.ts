import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { approveEntity } from "@/lib/approvals/entities";

const approveSchema = z.object({
  comment: z.string().optional(),
});

// Approve the current step of a draft journal entry's approval request. Only
// that step's approver can act; after the last step the entry can be posted.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = approveSchema.parse(body);

    const outcome = await approveEntity(ctx, "journal_entry", id, parsed.comment);

    logAudit({ ctx, action: "approve", entityType: "journal_entry", entityId: id, request });

    return NextResponse.json({ request: outcome.request, approved: outcome.finalized });
  } catch (err) {
    return handleError(err);
  }
}
