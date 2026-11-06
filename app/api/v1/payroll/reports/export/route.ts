import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { buildPayrollExportCsv } from "@/lib/api/payroll-reports";

/**
 * CSV of every employee in every finished run (void and deleted runs left
 * out), filtered by pay date. Tax and other deductions are separate columns.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const url = new URL(request.url);
    const csv = await buildPayrollExportCsv(ctx, {
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="payroll-export.csv"',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
