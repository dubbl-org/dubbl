import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob, contact } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const importSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(z.object({
    name: z.string().min(1),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    type: z.enum(["customer", "supplier", "both"]).default("customer"),
  })),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");
    const body = await request.json();
    const parsed = importSchema.parse(body);

    const [job] = await db.insert(bulkImportJob).values({
      organizationId: ctx.organizationId,
      type: "contacts",
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
        await db.insert(contact).values({
          organizationId: ctx.organizationId,
          name: parsed.rows[i].name,
          email: parsed.rows[i].email || null,
          phone: parsed.rows[i].phone || null,
          type: parsed.rows[i].type || "customer",
        });
        processedRows++;
      } catch (err) {
        errorRows++;
        errorDetails.push({ row: i + 1, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const [updated] = await db.update(bulkImportJob).set({
      processedRows,
      errorRows,
      errorDetails: errorDetails.length > 0 ? errorDetails : null,
      status: errorRows === parsed.rows.length ? "failed" : "completed",
      completedAt: new Date(),
    }).where(eq(bulkImportJob.id, job.id)).returning();

    return NextResponse.json({ job: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
