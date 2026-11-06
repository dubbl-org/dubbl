import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { importInvoices } from "@/lib/import-export/invoice-import";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

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
    const parsed = importSchema.parse(body);
    const source = (parsed.source || "custom") as SourceSystem;

    const { jobId, result } = await importInvoices(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      parsed.fileName,
      parsed.rows,
      source
    );

    const updated = await db.query.bulkImportJob.findFirst({ where: eq(bulkImportJob.id, jobId) });

    await logAudit({ ctx, action: "import", entityType: "invoice", entityId: ctx.organizationId,
      changes: { count: result.invoicesCreated, rows: result.processedRows, jobId }, request });

    return NextResponse.json({ job: updated, invoicesCreated: result.invoicesCreated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
