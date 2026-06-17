import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, sql, ilike } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { parseMoney } from "@/lib/import-export/transformers";
import { preProcessEntries } from "@/lib/import-export/pre-process";
import { assertNotLocked } from "@/lib/api/period-lock";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

const rowSchema = z.object({
  entryNumber: z.coerce.string().optional(),
  date: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().optional(),
  lineAccountCode: z.string().min(1),
  debit: z.coerce.string().optional().default("0"),
  credit: z.coerce.string().optional().default("0"),
});

const importSchema = z.object({
  fileName: z.string().min(1),
  source: z.string().optional(),
  post: z.boolean().optional().default(false),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:entries");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const source = (rawParsed.source || "custom") as SourceSystem;
    const post = rawParsed.post;
    const transformedRows = preProcessEntries(rawParsed.rows, source);
    const parsed = {
      fileName: rawParsed.fileName,
      rows: transformedRows.map(r => rowSchema.parse(r)),
    };

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "entries",
      fileName: parsed.fileName,
      totalRows: parsed.rows.length,
      status: "processing",
      createdBy: ctx.userId,
    }).returning();

    // Group rows by entryNumber (or date+description for ungrouped). Preserve
    // insertion order so error rows map back to a stable group index.
    const entryGroups = new Map<string, typeof parsed.rows>();
    for (const row of parsed.rows) {
      const key = row.entryNumber || `${row.date}|${row.description}`;
      const existing = entryGroups.get(key) || [];
      existing.push(row);
      entryGroups.set(key, existing);
    }

    // Allocate entry numbers sequentially within a single pass so concurrent
    // groups in this import never collide on the same number (the previous
    // per-group MAX re-query could hand out the same number twice).
    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(entry_number), 0)`.mapWith(Number) })
      .from(journalEntry)
      .where(eq(journalEntry.organizationId, ctx.organizationId));
    let nextEntryNumber = (maxResult?.max ?? 0) + 1;

    let processedRows = 0;
    let errorRows = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];
    let rowIndex = 0;

    for (const [, groupRows] of entryGroups) {
      const firstRow = groupRows[0];
      rowIndex++;
      try {
        // Reject single-line entries -- a valid double-entry needs >= 2 lines.
        if (groupRows.length < 2) {
          throw new Error("Entry must have at least 2 lines");
        }

        const lines = [];
        let totalDebit = 0;
        let totalCredit = 0;
        for (const row of groupRows) {
          // Resolve the account by code, scoped to this org, not soft-deleted,
          // and require it to be active.
          const account = await db.query.chartAccount.findFirst({
            where: and(
              eq(chartAccount.organizationId, ctx.organizationId),
              ilike(chartAccount.code, row.lineAccountCode.trim()),
              notDeleted(chartAccount.deletedAt),
            ),
            columns: { id: true, isActive: true },
          });
          if (!account) throw new Error(`Account not found: "${row.lineAccountCode}"`);
          if (!account.isActive) throw new Error(`Account is inactive: "${row.lineAccountCode}"`);

          const debitAmount = parseMoney(row.debit || "0");
          const creditAmount = parseMoney(row.credit || "0");

          // A line cannot carry both a debit and a credit.
          if (debitAmount !== 0 && creditAmount !== 0) {
            throw new Error(`Line for account "${row.lineAccountCode}" cannot have both a debit and a credit`);
          }

          totalDebit += debitAmount;
          totalCredit += creditAmount;
          lines.push({ accountId: account.id, debitAmount, creditAmount });
        }

        // Enforce a balanced, non-zero entry: sum of debits must equal sum of
        // credits, and the entry must move a non-zero amount.
        if (totalDebit !== totalCredit) {
          const imbalance = totalDebit - totalCredit;
          throw new Error(
            `Entry does not balance: debits ${totalDebit} != credits ${totalCredit} (imbalance ${imbalance} cents)`
          );
        }
        if (totalDebit === 0) {
          throw new Error("Entry must have non-zero amounts");
        }

        // When posting, the entry date must not fall in a locked period or a
        // closed fiscal year.
        if (post) {
          await assertNotLocked(ctx.organizationId, firstRow.date);
        }

        const entryNumber = nextEntryNumber;
        const [created] = await db.insert(journalEntry).values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: firstRow.date,
          description: firstRow.description,
          reference: firstRow.reference || null,
          status: post ? "posted" : "draft",
          postedAt: post ? new Date() : null,
          sourceType: "manual",
          createdBy: ctx.userId,
        }).returning();
        // Only advance the counter once the entry inserts successfully so a
        // failed group does not burn a number.
        nextEntryNumber++;

        await db.insert(journalLine).values(
          lines.map(l => ({ journalEntryId: created.id, ...l }))
        );
        processedRows++;
      } catch (err) {
        errorRows++;
        errorDetails.push({ row: rowIndex, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await db.update(bulkImportJob).set({
      processedRows,
      errorRows,
      errorDetails: errorDetails.length > 0 ? errorDetails : null,
      status: errorRows === entryGroups.size ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(bulkImportJob.id, job.id));

    const updated = await db.query.bulkImportJob.findFirst({ where: eq(bulkImportJob.id, job.id) });

    await logAudit({ ctx, action: "import", entityType: "journal_entry", entityId: ctx.organizationId,
      changes: { count: processedRows, jobId: job.id, posted: post }, request });

    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
