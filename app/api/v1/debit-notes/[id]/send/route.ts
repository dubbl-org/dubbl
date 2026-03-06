import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { debitNote } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createDebitNoteJournalEntry } from "@/lib/api/journal-automation";
import { assertNotLocked } from "@/lib/api/period-lock";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:debit-notes");

    const found = await db.query.debitNote.findFirst({
      where: and(
        eq(debitNote.id, id),
        eq(debitNote.organizationId, ctx.organizationId),
        notDeleted(debitNote.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Debit note");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft debit notes can be sent" },
        { status: 400 }
      );
    }

    await assertNotLocked(ctx.organizationId, found.issueDate);

    // Create journal entry
    const entry = await createDebitNoteJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        debitNoteNumber: found.debitNoteNumber,
        total: found.total,
        taxTotal: found.taxTotal,
        lines: found.lines.map((l) => ({
          accountId: l.accountId,
          amount: l.amount,
          taxAmount: l.taxAmount,
        })),
        date: found.issueDate,
      }
    );

    const [updated] = await db
      .update(debitNote)
      .set({
        status: "sent",
        sentAt: new Date(),
        amountRemaining: found.total,
        journalEntryId: entry?.id || null,
        updatedAt: new Date(),
      })
      .where(eq(debitNote.id, id))
      .returning();

    return NextResponse.json({ debitNote: updated });
  } catch (err) {
    return handleError(err);
  }
}
