import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import {
  bulkImportJob,
  bankTransaction,
  bankAccount,
  bankStatementImport,
} from "@/lib/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parseMoney } from "@/lib/import-export/transformers";
import { preProcessBankTransactions } from "@/lib/import-export/pre-process";
import type { SourceSystem } from "@/lib/import-export/types";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  makeTransactionDedupeHash,
  type NormalizedTransaction,
} from "@/lib/banking/importer";
import {
  loadActiveBankRules,
  applyBankRulesToTransaction,
} from "@/lib/api/bank-rules";
import { z } from "zod";

const rowSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.string(),
  reference: z.string().optional(),
  bankAccountCode: z.string().min(1),
});

const importSchema = z.object({
  fileName: z.string().min(1),
  source: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
});

async function resolveBankAccount(orgId: string, nameOrCode: string): Promise<string | null> {
  const found = await db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.organizationId, orgId),
      ilike(bankAccount.accountName, nameOrCode.trim()),
      notDeleted(bankAccount.deletedAt),
    ),
    columns: { id: true },
  });
  return found?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const source = (rawParsed.source || "custom") as SourceSystem;
    const transformedRows = preProcessBankTransactions(rawParsed.rows, source);
    const parsed = {
      fileName: rawParsed.fileName,
      rows: transformedRows.map(r => rowSchema.parse(r)),
    };

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "bank-transactions",
      fileName: parsed.fileName,
      totalRows: parsed.rows.length,
      status: "processing",
      createdBy: ctx.userId,
    }).returning();

    let processedRows = 0;
    let errorRows = 0;
    let duplicateRows = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];

    // Cache bank account lookups and per-account import history rows.
    const bankAccountCache = new Map<string, string | null>();
    const importIdCache = new Map<string, string>();
    // Track dedupe hashes already seen per bank account (existing + within this file).
    const seenHashesByAccount = new Map<string, Set<string>>();

    // Load the org's active bank rules once for auto-categorization.
    const activeRules = await loadActiveBankRules(ctx.organizationId);

    const contentHash = createHash("sha256")
      .update(JSON.stringify(rawParsed.rows))
      .digest("hex");

    // Lazily create one bank_statement_import history row per bank account.
    async function getImportId(bankAccountId: string): Promise<string> {
      const cached = importIdCache.get(bankAccountId);
      if (cached) return cached;
      const [importRow] = await db
        .insert(bankStatementImport)
        .values({
          organizationId: ctx.organizationId,
          bankAccountId,
          format: "csv",
          fileName: parsed.fileName,
          contentHash,
          importedCount: 0,
          duplicateCount: 0,
          errorCount: 0,
        })
        .returning();
      importIdCache.set(bankAccountId, importRow.id);
      return importRow.id;
    }

    // Load existing dedupe hashes for a bank account once.
    async function getSeenHashes(bankAccountId: string): Promise<Set<string>> {
      const cached = seenHashesByAccount.get(bankAccountId);
      if (cached) return cached;
      const existing = await db.query.bankTransaction.findMany({
        where: eq(bankTransaction.bankAccountId, bankAccountId),
        columns: { dedupeHash: true },
      });
      const set = new Set(
        existing.map((row) => row.dedupeHash).filter(Boolean) as string[]
      );
      seenHashesByAccount.set(bankAccountId, set);
      return set;
    }

    // Per-account counts for the import history rows.
    const importedCountByAccount = new Map<string, number>();
    const duplicateCountByAccount = new Map<string, number>();

    for (let i = 0; i < parsed.rows.length; i++) {
      try {
        const row = parsed.rows[i];

        let bankAccountId = bankAccountCache.get(row.bankAccountCode);
        if (bankAccountId === undefined) {
          bankAccountId = await resolveBankAccount(ctx.organizationId, row.bankAccountCode);
          bankAccountCache.set(row.bankAccountCode, bankAccountId);
        }
        if (!bankAccountId) throw new Error(`Bank account not found: "${row.bankAccountCode}"`);

        const amount = parseMoney(row.amount);

        // Build a normalized transaction so we can compute the dedupe hash
        // exactly the way the statement importer does.
        const normalized: NormalizedTransaction = {
          date: row.date,
          description: row.description,
          amount,
          reference: row.reference || null,
          raw: { row },
        };
        const dedupeHash = makeTransactionDedupeHash(bankAccountId, normalized);

        const seen = await getSeenHashes(bankAccountId);
        if (seen.has(dedupeHash)) {
          duplicateRows++;
          duplicateCountByAccount.set(
            bankAccountId,
            (duplicateCountByAccount.get(bankAccountId) || 0) + 1
          );
          continue;
        }
        seen.add(dedupeHash);

        const importId = await getImportId(bankAccountId);
        const assignment = activeRules.length
          ? applyBankRulesToTransaction(activeRules, normalized)
          : null;

        await db.insert(bankTransaction).values({
          bankAccountId,
          date: row.date,
          description: row.description,
          amount,
          reference: row.reference || null,
          sourceType: "csv_import",
          importId,
          dedupeHash,
          status: assignment?.reconcile ? "reconciled" : "unreconciled",
          accountId: assignment?.accountId ?? null,
          contactId: assignment?.contactId ?? null,
          taxRateId: assignment?.taxRateId ?? null,
        });
        processedRows++;
        importedCountByAccount.set(
          bankAccountId,
          (importedCountByAccount.get(bankAccountId) || 0) + 1
        );
      } catch (err) {
        errorRows++;
        errorDetails.push({ row: i + 1, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    // Finalize each per-account import history row with its counts/status.
    for (const [bankAccountId, importId] of importIdCache) {
      const imported = importedCountByAccount.get(bankAccountId) || 0;
      const duplicates = duplicateCountByAccount.get(bankAccountId) || 0;
      await db
        .update(bankStatementImport)
        .set({
          importedCount: imported,
          duplicateCount: duplicates,
          status: imported === 0 && duplicates > 0 ? "partial" : "completed",
        })
        .where(eq(bankStatementImport.id, importId));
    }

    await db.update(bulkImportJob).set({
      processedRows,
      errorRows,
      errorDetails: errorDetails.length > 0 ? errorDetails : null,
      status: errorRows === parsed.rows.length && parsed.rows.length > 0 ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(bulkImportJob.id, job.id));

    const updated = await db.query.bulkImportJob.findFirst({ where: eq(bulkImportJob.id, job.id) });
    return NextResponse.json(
      { job: updated, duplicates: duplicateRows },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
