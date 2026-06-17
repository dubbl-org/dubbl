import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, lte, isNull, sql } from "drizzle-orm";

/**
 * Auto-reversing journals (accruals / prepayments).
 *
 * When a posted entry carries an `autoReverseDate`, this job posts a mirror
 * reversing entry on that date — swapping each line's debit and credit — so the
 * accrual/prepayment unwinds automatically in the next period. The original and
 * the reversal are linked both ways via `reversedByEntryId` / `reversesEntryId`,
 * which also makes the job idempotent: once an entry has a `reversedByEntryId`
 * it is never reversed again.
 *
 * Only POSTED entries are eligible (drafts/voids are skipped), and the reversal
 * is posted dated `autoReverseDate` so it lands in the correct period.
 */

async function nextEntryNumber(
  exec: Parameters<Parameters<(typeof db)["transaction"]>[0]>[0],
  organizationId: string
): Promise<number> {
  const [m] = await exec
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (m?.max || 0) + 1;
}

/**
 * Post the mirror reversing entry for one due original entry, linking the pair.
 * Idempotent: re-checks `reversedByEntryId` inside the transaction so concurrent
 * runs can't double-post. Returns true if a reversal was posted.
 */
async function reverseEntry(originalId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const original = await tx.query.journalEntry.findFirst({
      where: eq(journalEntry.id, originalId),
      with: { lines: true },
    });

    // Re-validate eligibility under the transaction (guards against a concurrent
    // run having already reversed it between the outer query and here).
    if (
      !original ||
      original.status !== "posted" ||
      original.deletedAt ||
      original.reversedByEntryId ||
      !original.autoReverseDate
    ) {
      return false;
    }

    const entryNumber = await nextEntryNumber(tx, original.organizationId);

    const [reversal] = await tx
      .insert(journalEntry)
      .values({
        organizationId: original.organizationId,
        entryNumber,
        date: original.autoReverseDate,
        description: `Auto-reversal of entry #${original.entryNumber}: ${original.description}`,
        reference: original.reference
          ? `REV-${original.reference}`
          : `REV-${original.entryNumber}`,
        status: "posted",
        sourceType: "auto_reversal",
        sourceId: original.id,
        postedAt: new Date(),
        createdBy: original.createdBy,
        reversesEntryId: original.id,
      })
      .returning();

    // Mirror each line, swapping debit/credit and preserving dimensions.
    if (original.lines.length > 0) {
      await tx.insert(journalLine).values(
        original.lines.map((l) => ({
          journalEntryId: reversal.id,
          accountId: l.accountId,
          description: l.description,
          debitAmount: l.creditAmount,
          creditAmount: l.debitAmount,
          currencyCode: l.currencyCode,
          exchangeRate: l.exchangeRate,
          costCenterId: l.costCenterId,
          projectId: l.projectId,
        }))
      );
    }

    // Link the original back to its reversal so it's never reversed again.
    await tx
      .update(journalEntry)
      .set({ reversedByEntryId: reversal.id, updatedAt: new Date() })
      .where(eq(journalEntry.id, original.id));

    return true;
  });
}

/**
 * Find every posted entry whose `autoReverseDate` has arrived (<= today) and
 * which has not yet been reversed, and post its mirror reversing entry. Intended
 * to run daily from a scheduled job. Errors on one entry don't abort the rest.
 */
export async function processAutoReversals(
  today: string = new Date().toISOString().slice(0, 10)
): Promise<{ checked: number; reversed: number; failed: number }> {
  const due = await db
    .select({ id: journalEntry.id })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.status, "posted"),
        isNull(journalEntry.deletedAt),
        isNull(journalEntry.reversedByEntryId),
        sql`${journalEntry.autoReverseDate} is not null`,
        lte(journalEntry.autoReverseDate, today)
      )
    );

  let reversed = 0;
  let failed = 0;
  for (const e of due) {
    try {
      if (await reverseEntry(e.id)) reversed++;
    } catch (err) {
      failed++;
      console.error(`auto-reverse failed for entry ${e.id}`, err);
    }
  }

  return { checked: due.length, reversed, failed };
}
