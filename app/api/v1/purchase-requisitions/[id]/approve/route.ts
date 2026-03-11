import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseRequisition } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:purchases");
    const { id } = await params;

    const [updated] = await db
      .update(purchaseRequisition)
      .set({
        status: "approved",
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(purchaseRequisition.id, id),
          eq(purchaseRequisition.organizationId, ctx.organizationId),
          eq(purchaseRequisition.status, "submitted"),
          notDeleted(purchaseRequisition.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Purchase requisition");
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
