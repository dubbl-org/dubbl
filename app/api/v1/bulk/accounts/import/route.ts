import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, chartAccount } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const importSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    subType: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accounts");
    const body = await request.json();
    const parsed = importSchema.parse(body);

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "accounts",
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
        await db.insert(chartAccount).values({
          organizationId: ctx.organizationId,
          code: parsed.rows[i].code,
          name: parsed.rows[i].name,
          type: parsed.rows[i].type,
          subType: parsed.rows[i].subType || null,
          description: parsed.rows[i].description || null,
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
