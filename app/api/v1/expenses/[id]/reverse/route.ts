import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim, journalEntry } from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";

// Reverse an approved (or paid) expense claim and return it to an editable
// draft. Approval posts DR expense / CR Employee Reimbursements Payable, and
// payment posts DR Payable / CR Bank — both stay in the books with no undo
// today, so a mistake on an approved claim is a dead end. This reverses every
// posted entry the claim produced (approval + payment), keeping the audit
// trail, then resets the claim so it can be corrected and resubmitted.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    // Reversing posts GL entries and clears an approval, so require the same
    // authority as approving.
    requireRole(ctx, "approve:expenses");

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
    });

    if (!found) return notFound("Expense claim");
    if (found.status !== "approved" && found.status !== "paid") {
      return NextResponse.json(
        { error: "Only an approved or paid claim needs reversing. A draft, submitted, or rejected claim can be edited directly." },
        { status: 400 }
      );
    }

    // Every posted entry this claim produced: the approval entry and, if paid,
    // the payment entry. Skip any already reversed.
    const entries = await db.query.journalEntry.findMany({
      where: and(
        eq(journalEntry.organizationId, ctx.organizationId),
        eq(journalEntry.sourceId, id),
        inArray(journalEntry.sourceType, ["expense_claim", "expense_claim_payment"]),
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.reversedByEntryId)
      ),
    });

    // Block if any of those entries fall in a locked/closed period.
    for (const e of entries) {
      await assertNotLocked(ctx.organizationId, e.date, ctx);
    }

    const [updated] = await db.transaction(async (tx) => {
      for (const e of entries) {
        await reverseJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            entryId: e.id,
            date: e.date,
            description: `Reversal — ${e.description}`,
            reference: e.reference,
            sourceType: "expense_claim_reversal",
            sourceId: id,
          },
          tx
        );
      }

      // Back to an editable draft so the user can fix and resubmit.
      return tx
        .update(expenseClaim)
        .set({
          status: "draft",
          approvedAt: null,
          approvedBy: null,
          paidAt: null,
          journalEntryId: null,
          updatedAt: new Date(),
        })
        .where(eq(expenseClaim.id, id))
        .returning();
    });

    logAudit({
      ctx,
      action: "reverse",
      entityType: "expense",
      entityId: id,
      changes: { previousStatus: found.status, reversedEntries: entries.map((e) => e.id) },
      request,
    });

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}
