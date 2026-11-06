import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, contact } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { preProcessContacts } from "@/lib/import-export/pre-process";
import { validateImportRows } from "@/lib/import-export/validate-rows";
import { z } from "zod";
import { emitContactCreated } from "@/lib/webhooks/events";

const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
  taxNumber: z.string().nullable().optional(),
  billingLine1: z.string().nullable().optional(),
  billingCity: z.string().nullable().optional(),
  billingState: z.string().nullable().optional(),
  billingPostalCode: z.string().nullable().optional(),
  billingCountry: z.string().nullable().optional(),
});

const importSchema = z.object({
  fileName: z.string().min(1),
  source: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const transformedRows = preProcessContacts(rawParsed.rows);
    // Validate row by row: bad rows are reported, the rest still import.
    const checked = validateImportRows(transformedRows, rowSchema);
    const parsed = {
      fileName: rawParsed.fileName,
      rows: checked.rows,
    };

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "contacts",
      fileName: parsed.fileName,
      totalRows: transformedRows.length,
      status: "processing",
      createdBy: ctx.userId,
    }).returning();

    let processedRows = 0;
    let errorRows = checked.invalid.length;
    const errorDetails: Array<{ row: number; error: string }> = [...checked.invalid];

    for (let i = 0; i < parsed.rows.length; i++) {
      try {
        const row = parsed.rows[i];
        const hasAddress = row.billingLine1 || row.billingCity || row.billingState || row.billingPostalCode || row.billingCountry;
        const [created] = await db.insert(contact).values({
          organizationId: ctx.organizationId,
          name: row.name,
          email: row.email || null,
          phone: row.phone || null,
          type: row.type || "customer",
          taxNumber: row.taxNumber || null,
          addresses: hasAddress ? {
            billing: {
              line1: row.billingLine1 || undefined,
              city: row.billingCity || undefined,
              state: row.billingState || undefined,
              postalCode: row.billingPostalCode || undefined,
              country: row.billingCountry || undefined,
            },
          } : undefined,
        }).returning({ id: contact.id });
        emitContactCreated(ctx.organizationId, [created.id]);
        processedRows++;
      } catch (err) {
        errorRows++;
        errorDetails.push({ row: checked.rowNumbers[i], error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const [updated] = await db.update(bulkImportJob).set({
      processedRows,
      errorRows,
      errorDetails: errorDetails.length > 0 ? errorDetails : null,
      status: processedRows === 0 ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(bulkImportJob.id, job.id)).returning();

    await logAudit({ ctx, action: "import", entityType: "contact", entityId: ctx.organizationId,
      changes: { count: processedRows, jobId: job.id }, request });

    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
