import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { rejectEntity } from "@/lib/approvals/entities";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

// Reject a draft purchase order's approval request (current step's approver
// only). The order stays a draft; fix it and submit it again.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body);

    const outcome = await rejectEntity(ctx, "purchase_order", id, parsed.reason);

    logAudit({ ctx, action: "reject", entityType: "purchase_order", entityId: id, request });

    return NextResponse.json({ request: outcome.request });
  } catch (err) {
    return handleError(err);
  }
}
