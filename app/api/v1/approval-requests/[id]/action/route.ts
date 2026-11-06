import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequest } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { processApprovalAction, resolveApprovalMember } from "@/lib/approvals/engine";
import { approveEntity, rejectEntity } from "@/lib/approvals/entities";
import { ProcurementBlockedError } from "../../../bills/_procurement";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "comment"]),
  comment: z.string().optional(),
});

// Act on an approval request. Approve / reject go through the same path as the
// record's own approve / reject action, so the record moves on too (a fully
// approved bill posts, a rejected invoice becomes rejected, ...). Only the
// current step's approver can approve or reject; anyone can comment.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify request belongs to this org
    const existing = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.id, id),
        eq(approvalRequest.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Approval request");

    const body = await request.json();
    const parsed = actionSchema.parse(body);

    if (parsed.action === "comment") {
      const mem = await resolveApprovalMember(ctx);
      const updated = await processApprovalAction(id, mem.id, "comment", parsed.comment, ctx.organizationId);
      return NextResponse.json({ request: updated });
    }

    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Approval request is no longer pending" }, { status: 409 });
    }

    const outcome =
      parsed.action === "approve"
        ? await approveEntity(ctx, existing.entityType, existing.entityId, parsed.comment)
        : await rejectEntity(ctx, existing.entityType, existing.entityId, parsed.comment);

    logAudit({ ctx, action: parsed.action, entityType: existing.entityType, entityId: existing.entityId, request });

    return NextResponse.json({ request: outcome.request, entity: outcome.entity, finalized: outcome.finalized });
  } catch (err) {
    if (err instanceof ProcurementBlockedError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 422 });
    }
    return handleError(err);
  }
}
