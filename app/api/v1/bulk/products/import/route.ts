import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, inventoryItem } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { preProcessProducts } from "@/lib/import-export/pre-process";
import { z } from "zod";

const rowSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  unitPrice: z.coerce.number().optional().default(0),
  costPrice: z.coerce.number().optional().default(0),
  type: z.string().optional(),
  quantityOnHand: z.coerce.number().int().optional().default(0),
});

const importSchema = z.object({
  fileName: z.string().min(1),
  source: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const body = await request.json();
    const rawParsed = importSchema.parse(body);
    const transformedRows = preProcessProducts(rawParsed.rows);
    const parsed = {
      fileName: rawParsed.fileName,
      rows: transformedRows.map(r => rowSchema.parse(r)),
    };

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "products",
      fileName: parsed.fileName,
      totalRows: parsed.rows.length,
      status: "processing",
      createdBy: ctx.userId,
    }).returning();

    // Generate unique codes
    const [maxResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(inventoryItem)
      .where(eq(inventoryItem.organizationId, ctx.organizationId));
    let codeCounter = (maxResult?.count ?? 0) + 1;

    let processedRows = 0;
    let errorRows = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      try {
        const row = parsed.rows[i];
        const code = row.sku || `PROD-${String(codeCounter).padStart(4, "0")}`;
        codeCounter++;

        await db.insert(inventoryItem).values({
          organizationId: ctx.organizationId,
          code,
          name: row.name,
          sku: row.sku || null,
          description: row.description || null,
          salePrice: Math.round(row.unitPrice * 100),
          purchasePrice: Math.round(row.costPrice * 100),
          quantityOnHand: row.quantityOnHand,
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
