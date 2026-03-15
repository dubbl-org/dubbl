import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { resolveAccountByCode } from "@/lib/import-export/reference-resolver";
import { parseMoney } from "@/lib/import-export/transformers";
import { preProcessEntries } from "@/lib/import-export/pre-process";
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
  rows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:entries");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const source = (rawParsed.source || "custom") as SourceSystem;
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

    // Group rows by entryNumber (or date+description for ungrouped)
    const entryGroups = new Map<string, typeof parsed.rows>();
    for (const row of parsed.rows) {
      const key = row.entryNumber || `${row.date}|${row.description}`;
      const existing = entryGroups.get(key) || [];
      existing.push(row);
      entryGroups.set(key, existing);
    }

    let processedRows = 0;
    let errorRows = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];
    let rowIndex = 0;

    for (const [, groupRows] of entryGroups) {
      const firstRow = groupRows[0];
      rowIndex++;
      try {
        // Get next entry number
        const [maxResult] = await db
          .select({ max: sql<number>`COALESCE(MAX(entry_number), 0)`.mapWith(Number) })
          .from(journalEntry)
          .where(eq(journalEntry.organizationId, ctx.organizationId));
        const entryNumber = (maxResult?.max ?? 0) + 1;

        const lines = [];
        for (const row of groupRows) {
          const accountId = await resolveAccountByCode(ctx.organizationId, row.lineAccountCode);
          if (!accountId) throw new Error(`Account not found: "${row.lineAccountCode}"`);

          const debitAmount = parseMoney(row.debit || "0");
          const creditAmount = parseMoney(row.credit || "0");

          lines.push({ accountId, debitAmount, creditAmount });
        }

        const [created] = await db.insert(journalEntry).values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: firstRow.date,
          description: firstRow.description,
          reference: firstRow.reference || null,
          sourceType: "manual",
          createdBy: ctx.userId,
        }).returning();

        if (lines.length > 0) {
          await db.insert(journalLine).values(
            lines.map(l => ({ journalEntryId: created.id, ...l }))
          );
        }
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
    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
