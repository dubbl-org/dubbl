import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import {
  checkApprovalRequired,
  createApprovalRequest,
} from "@/lib/approvals/engine";

// Send a draft invoice into the approval workflow: draft -> pending_approval,
// creating an approval_request (entityType "invoice") that approvers act on.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!found) return notFound("Invoice");
    if (found.status !== "draft") {
      return validationError("Only draft invoices can be submitted for approval");
    }

    // Resolve the member record for the requester (approval_request requires a
    // member id, not a user id).
    const requester = await db.query.member.findFirst({
      where: and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });
    if (!requester) return notFound("Member");

    // Find the active approval workflow whose conditions match this invoice.
    const workflow = await checkApprovalRequired(
      ctx.organizationId,
      "invoice",
      found as unknown as Record<string, unknown>
    );

    if (!workflow || workflow.steps.length === 0) {
      return validationError("No active approval workflow configured for invoices");
    }

    // Create the approval request (entityType "invoice") and move the invoice
    // into the pending_approval state.
    await createApprovalRequest(
      ctx.organizationId,
      workflow.id,
      "invoice",
      id,
      requester.id
    );

    const [updated] = await db
      .update(invoice)
      .set({ status: "pending_approval", updatedAt: new Date() })
      .where(
        and(eq(invoice.id, id), eq(invoice.organizationId, ctx.organizationId))
      )
      .returning();

    if (!updated) return notFound("Invoice");

    logAudit({
      ctx,
      action: "submit_for_approval",
      entityType: "invoice",
      entityId: id,
      changes: { previousStatus: found.status },
      request,
    });

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    return handleError(err);
  }
}
