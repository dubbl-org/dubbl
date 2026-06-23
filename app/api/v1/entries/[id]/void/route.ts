import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import { centsToDecimal } from "@/lib/money";
import { z } from "zod";

const voidSchema = z.object({
  reason: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "void:entries");

    const body = await request.json();
    const { reason } = voidSchema.parse(body);

    const entry = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.id, id),
        eq(journalEntry.organizationId, ctx.organizationId)
      ),
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (entry.status !== "posted") {
      return NextResponse.json(
        { error: "Only posted entries can be voided" },
        { status: 400 }
      );
    }
    if (entry.reversedByEntryId) {
      return NextResponse.json(
        { error: "This entry has already been reversed" },
        { status: 400 }
      );
    }
    // The reversal posts on the original entry's date — block it if that period
    // is locked or in a closed fiscal year.
    await assertNotLocked(ctx.organizationId, entry.date, ctx);

    // Reverse the entry by posting a mirror (debit/credit swapped) and marking
    // the original "reversed", keeping BOTH posted so reports net the pair to
    // zero. Previously this just flipped status to "void", which silently
    // deleted the amount from every report (even closed periods) with no
    // offsetting record — the opposite of what the UI promised.
    await db.transaction(async (tx) => {
      await reverseJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          entryId: id,
          date: entry.date,
          description: `Reversal of entry #${entry.entryNumber}${reason ? ` — ${reason}` : ""}`,
          reference: entry.reference,
          sourceType: "manual_reversal",
          sourceId: entry.id,
        },
        tx
      );
      // Stamp the original as reversed (reverseJournalEntry already set
      // reversedByEntryId; this records why and when).
      await tx
        .update(journalEntry)
        .set({ voidedAt: new Date(), voidReason: reason, updatedAt: new Date() })
        .where(eq(journalEntry.id, id));
    });

    const full = await db.query.journalEntry.findFirst({
      where: eq(journalEntry.id, id),
      with: {
        lines: {
          with: { account: true },
        },
      },
    });

    logAudit({ ctx, action: "void", entityType: "journal_entry", entityId: id, changes: { previousStatus: entry.status }, request });

    return NextResponse.json({
      entry: {
        ...full,
        lines: full?.lines.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          accountCode: l.account?.code || "",
          accountName: l.account?.name || "",
          description: l.description,
          debitAmount: centsToDecimal(l.debitAmount),
          creditAmount: centsToDecimal(l.creditAmount),
        })),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
