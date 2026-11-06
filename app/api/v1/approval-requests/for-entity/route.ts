import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getApprovalStatus } from "@/lib/approvals/entities";
import { APPROVAL_ENTITY_TYPES } from "@/lib/approvals/select";

const querySchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

// Where one record stands in its approval workflow: the active workflow that
// matches it, its latest approval request (steps, approvers, actions), whether
// the caller is the current step's approver, and (journal entries / purchase
// orders) whether posting / sending is blocked until approval.
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      entityType: url.searchParams.get("entityType"),
      entityId: url.searchParams.get("entityId"),
    });

    const status = await getApprovalStatus(ctx, parsed.entityType, parsed.entityId);
    return NextResponse.json(status);
  } catch (err) {
    return handleError(err);
  }
}
