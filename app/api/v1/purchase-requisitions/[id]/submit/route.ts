import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseRequisition } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

/** Send a draft (or a revised, rejected) requisition for approval. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const existing = await db.query.purchaseRequisition.findFirst({
      where: and(
        eq(purchaseRequisition.id, id),
        eq(purchaseRequisition.organizationId, ctx.organizationId),
        notDeleted(purchaseRequisition.deletedAt)
      ),
    });
    if (!existing) return notFound("Purchase requisition");

    const [updated] = await db
      .update(purchaseRequisition)
      .set({
        status: "submitted",
        // A resubmitted request starts a fresh decision
        rejectedAt: null,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(purchaseRequisition.id, id),
          inArray(purchaseRequisition.status, ["draft", "rejected"])
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Only draft or rejected requisitions can be submitted" },
        { status: 400 }
      );
    }

    logAudit({ ctx, action: "submit", entityType: "purchase_requisition", entityId: id, changes: { previousStatus: existing.status }, request });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
