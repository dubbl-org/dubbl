import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, bill, billLine } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getNextNumber } from "@/lib/api/numbering";
import { resolveContactByName, resolveAccountByCode } from "@/lib/import-export/reference-resolver";
import { parseMoney } from "@/lib/import-export/transformers";
import { preProcessBills } from "@/lib/import-export/pre-process";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

const rowSchema = z.object({
  billNumber: z.string().optional(),
  contactName: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  lineDescription: z.string().min(1),
  lineQuantity: z.coerce.number().optional().default(1),
  lineUnitPrice: z.coerce.number().optional().default(0),
  lineAmount: z.coerce.string().optional(),
  lineAccountCode: z.string().optional(),
});

const importSchema = z.object({
  fileName: z.string().min(1),
  source: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const source = (rawParsed.source || "custom") as SourceSystem;
    const transformedRows = preProcessBills(rawParsed.rows, source);
    const parsed = {
      fileName: rawParsed.fileName,
      rows: transformedRows.map(r => rowSchema.parse(r)),
    };

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "bills",
      fileName: parsed.fileName,
      totalRows: parsed.rows.length,
      status: "processing",
      createdBy: ctx.userId,
    }).returning();

    // Group rows by billNumber to support multi-line bills
    const billGroups = new Map<string, typeof parsed.rows>();
    for (const row of parsed.rows) {
      const key = row.billNumber || `_auto_${billGroups.size}`;
      const existing = billGroups.get(key) || [];
      existing.push(row);
      billGroups.set(key, existing);
    }

    let processedRows = 0;
    let errorRows = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];
    let rowIndex = 0;

    for (const [, groupRows] of billGroups) {
      const firstRow = groupRows[0];
      rowIndex++;
      try {
        const contactId = await resolveContactByName(ctx.organizationId, firstRow.contactName);
        if (!contactId) throw new Error(`Contact not found: "${firstRow.contactName}"`);

        const billNumber = await getNextNumber(ctx.organizationId, "bill", "bill_number", "BILL");

        let subtotal = 0;
        const processedLines = [];
        for (let j = 0; j < groupRows.length; j++) {
          const line = groupRows[j];
          let amount: number;
          if (line.lineAmount) {
            amount = parseMoney(String(line.lineAmount));
          } else {
            amount = Math.round(line.lineQuantity * line.lineUnitPrice * 100);
          }
          subtotal += amount;

          let accountId: string | null = null;
          if (line.lineAccountCode) {
            accountId = await resolveAccountByCode(ctx.organizationId, line.lineAccountCode);
          }

          processedLines.push({
            description: line.lineDescription,
            quantity: Math.round(line.lineQuantity * 100),
            unitPrice: Math.round(line.lineUnitPrice * 100),
            accountId,
            taxRateId: null,
            taxAmount: 0,
            amount,
            sortOrder: j,
          });
        }

        const [created] = await db.insert(bill).values({
          organizationId: ctx.organizationId,
          contactId,
          billNumber,
          issueDate: firstRow.issueDate,
          dueDate: firstRow.dueDate,
          subtotal,
          taxTotal: 0,
          total: subtotal,
          amountPaid: 0,
          amountDue: subtotal,
          createdBy: ctx.userId,
        }).returning();

        if (processedLines.length > 0) {
          await db.insert(billLine).values(
            processedLines.map(l => ({ billId: created.id, ...l }))
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
      status: errorRows === billGroups.size ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(bulkImportJob.id, job.id));

    const updated = await db.query.bulkImportJob.findFirst({ where: eq(bulkImportJob.id, job.id) });
    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
