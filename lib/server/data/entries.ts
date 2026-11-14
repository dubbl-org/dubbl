import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { journalEntry } from "@/lib/db/schema";

/**
 * Manual journal entries, mirroring GET /api/v1/entries: every entry with its
 * lines, newest first, plus the debit total the list renders.
 */
export async function listJournalEntries(organizationId: string, limit = 100) {
  const rows = await db.query.journalEntry.findMany({
    where: eq(journalEntry.organizationId, organizationId),
    orderBy: desc(journalEntry.createdAt),
    limit,
    with: { lines: true },
  });

  return rows.map((e) => ({
    ...e,
    totalDebit: e.lines.reduce((sum, l) => sum + l.debitAmount, 0) / 100,
  }));
}
