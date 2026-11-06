import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { runSavedReportConfig, SAVED_REPORT_SOURCE_KEYS } from "@/lib/reports/saved-report-data";
import { z } from "zod";

const runSchema = z.object({
  dataSource: z.enum(SAVED_REPORT_SOURCE_KEYS),
  filters: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
  groupBy: z.array(z.string()).default([]),
  columns: z.array(z.string()).min(1),
  dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
});

/**
 * Run a custom report config and return its rows. Money columns (listed in
 * `moneyColumns`) are integer cents. Supports every data source a saved
 * report can use (see lib/reports/saved-report-data.ts).
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const body = await request.json();
    const config = runSchema.parse(body);

    const result = await runSavedReportConfig(ctx.organizationId, config);
    return ok({
      data: result.rows,
      total: result.rows.length,
      columns: result.columns,
      moneyColumns: result.moneyColumns,
      currency: result.currency,
    });
  } catch (err) {
    return handleError(err);
  }
}
