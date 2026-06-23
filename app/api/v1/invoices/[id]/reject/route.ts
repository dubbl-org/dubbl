import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, approvalRequest, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { processApprovalAction } from "@/lib/approvals/engine";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

// Reject an invoice that is pending approval: records the rejection on the
// approval_request (with an optional reason) and moves the invoice to
// "rejected".
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body);

    // Resolve the member record for the approver (approval engine keys actions
    // by member id, not user id).
    const approver = await db.query.member.findFirst({
      where: and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });
    if (!approver) return notFound("Member");

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!found) return notFound("Invoice");
    if (found.status !== "pending_approval") {
      return validationError("Only invoices pending approval can be rejected");
    }

    // Find the open approval request for this invoice.
    const pendingRequest = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.organizationId, ctx.organizationId),
        eq(approvalRequest.entityType, "invoice"),
        eq(approvalRequest.entityId, id),
        eq(approvalRequest.status, "pending")
      ),
    });
    if (!pendingRequest) {
      return validationError("No pending approval request found for this invoice");
    }

    // Record the rejection on the approval request (a reject at any step rejects
    // the whole request).
    const requestResult = await processApprovalAction(
      pendingRequest.id,
      approver.id,
      "reject",
      parsed.reason
    );

    const [updated] = await db
      .update(invoice)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(
        and(eq(invoice.id, id), eq(invoice.organizationId, ctx.organizationId))
      )
      .returning();

    if (!updated) return notFound("Invoice");

    logAudit({
      ctx,
      action: "reject",
      entityType: "invoice",
      entityId: id,
      changes: { previousStatus: found.status },
      request,
    });

    return NextResponse.json({ invoice: updated, request: requestResult });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not the approver")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return handleError(err);
  }
}
