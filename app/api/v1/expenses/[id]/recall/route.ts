import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

// Recall a claim that's awaiting approval back to draft so it can be edited.
// Only "submitted" claims qualify — they haven't been approved, so nothing has
// been posted to the ledger and pulling it back is a no-op accounting-wise.
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
    if (found.status !== "submitted") {
      return NextResponse.json(
        { error: "Only a claim that's awaiting approval can be recalled" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(expenseClaim)
      .set({
        status: "draft",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(expenseClaim.id, id))
      .returning();

    logAudit({ ctx, action: "recall", entityType: "expense", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}
