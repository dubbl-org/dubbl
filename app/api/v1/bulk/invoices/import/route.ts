import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, invoice, invoiceLine } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { getNextNumber } from "@/lib/api/numbering";
import { preProcessInvoices } from "@/lib/import-export/pre-process";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
});

const rowSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  reference: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

const importSchema = z.object({
  fileName: z.string().min(1),
  source: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const source = (rawParsed.source || "custom") as SourceSystem;
    const transformedRows = preProcessInvoices(rawParsed.rows, source);
    const parsed = {
      fileName: rawParsed.fileName,
      rows: transformedRows.map(r => rowSchema.parse(r)),
    };

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "invoices",
      fileName: parsed.fileName,
      totalRows: parsed.rows.length,
      status: "processing",
      createdBy: ctx.userId,
    }).returning();

    let processedRows = 0;
    let errorRows = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      try {
        const row = parsed.rows[i];
        const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

        let subtotal = 0;
        const processedLines = row.lines.map((l, j) => {
          const amount = Math.round(l.quantity * l.unitPrice * 100);
          subtotal += amount;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: Math.round(l.unitPrice * 100),
            accountId: l.accountId || null,
            taxRateId: null,
            taxAmount: 0,
            amount,
            sortOrder: j,
          };
        });

        const [created] = await db.insert(invoice).values({
          organizationId: ctx.organizationId,
          contactId: row.contactId,
          invoiceNumber,
          issueDate: row.issueDate,
          dueDate: row.dueDate,
          reference: row.reference || null,
          subtotal,
          taxTotal: 0,
          total: subtotal,
          amountPaid: 0,
          amountDue: subtotal,
          createdBy: ctx.userId,
        }).returning();

        if (processedLines.length > 0) {
          await db.insert(invoiceLine).values(
            processedLines.map(l => ({ invoiceId: created.id, ...l }))
          );
        }
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

    await logAudit({ ctx, action: "import", entityType: "invoice", entityId: ctx.organizationId,
      changes: { count: processedRows, jobId: job.id }, request });

    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
