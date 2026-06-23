import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:expenses");

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
    });

    if (!found) return notFound("Expense claim");
    // A fresh draft is submitted; a rejected claim that's been corrected is
    // re-submitted (clearing the previous rejection so it returns to the
    // approval queue clean).
    if (found.status !== "draft" && found.status !== "rejected") {
      return NextResponse.json(
        { error: "Only draft or rejected expense claims can be submitted" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(expenseClaim)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(expenseClaim.id, id))
      .returning();

    logAudit({ ctx, action: "submit", entityType: "expense", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}
