import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { getTaxLiabilityReport } from "@/lib/api/payroll-reports";

/** Finished runs only (void and deleted runs are left out), filtered by pay date. */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const url = new URL(request.url);
    const range = {
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    };

    return ok(await getTaxLiabilityReport(ctx, range));
  } catch (err) {
    return handleError(err);
  }
}
