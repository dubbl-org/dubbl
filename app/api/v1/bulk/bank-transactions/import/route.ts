import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, bankTransaction, bankAccount } from "@/lib/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parseMoney } from "@/lib/import-export/transformers";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const importSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(z.object({
    date: z.string().min(1),
    description: z.string().min(1),
    amount: z.coerce.string(),
    reference: z.string().optional(),
    bankAccountCode: z.string().min(1),
  })),
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
    const parsed = importSchema.parse(body);

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
    const errorDetails: Array<{ row: number; error: string }> = [];

    // Cache bank account lookups
    const bankAccountCache = new Map<string, string | null>();

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

        await db.insert(bankTransaction).values({
          bankAccountId,
          date: row.date,
          description: row.description,
          amount,
          reference: row.reference || null,
          sourceType: "csv_import",
        });
        processedRows++;
      } catch (err) {
        errorRows++;
        errorDetails.push({ row: i + 1, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await db.update(bulkImportJob).set({
      processedRows,
      errorRows,
      errorDetails: errorDetails.length > 0 ? errorDetails : null,
      status: errorRows === parsed.rows.length ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(bulkImportJob.id, job.id));

    const updated = await db.query.bulkImportJob.findFirst({ where: eq(bulkImportJob.id, job.id) });
    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
