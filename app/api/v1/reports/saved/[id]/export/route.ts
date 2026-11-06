import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedReport } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import type { ReportConfig } from "@/lib/db/schema/reports";
import { runSavedReportConfig } from "@/lib/reports/saved-report-data";
import { savedReportFile, type SavedReportFormat } from "@/lib/reports/saved-report-file";

/**
 * Download a saved report. `?format=csv|xlsx|pdf` (default csv). Money columns
 * are written as decimal amounts (cents / 100).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");

    const report = await db.query.savedReport.findFirst({
      where: and(
        eq(savedReport.id, id),
        eq(savedReport.organizationId, ctx.organizationId),
        notDeleted(savedReport.deletedAt)
      ),
    });

    if (!report) return notFound("Report");

    const requested = new URL(request.url).searchParams.get("format");
    const format: SavedReportFormat = requested === "xlsx" || requested === "pdf" ? requested : "csv";
    const result = await runSavedReportConfig(ctx.organizationId, report.config as ReportConfig);
    const file = await savedReportFile(report.name, result, format);

    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
