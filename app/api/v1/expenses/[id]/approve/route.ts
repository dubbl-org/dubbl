import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { createExpenseClaimApprovalJournalEntry } from "@/lib/api/expense-claims";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:expenses");

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
      with: {
        items: {
          with: { account: true },
        },
      },
    });

    if (!found) return notFound("Expense claim");
    if (found.status !== "submitted") {
      return NextResponse.json(
        { error: "Only submitted expense claims can be approved" },
        { status: 400 }
      );
    }

    const approvedAt = new Date();
    // Post the approval entry (DR expense accounts / CR Employee Reimbursements
    // Payable) and flip status to approved atomically, so the obligation is
    // recognized in AP the moment the claim is approved.
    const updated = await db.transaction(async (tx) => {
      const entry = await createExpenseClaimApprovalJournalEntry(
        ctx,
        found,
        tx,
        approvedAt.toISOString().slice(0, 10)
      );

      const [row] = await tx
        .update(expenseClaim)
        .set({
          status: "approved",
          approvedBy: ctx.userId,
          approvedAt,
          journalEntryId: entry.id,
          updatedAt: approvedAt,
        })
        .where(eq(expenseClaim.id, id))
        .returning();
      return row;
    });

    logAudit({ ctx, action: "approve", entityType: "expense", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}
