import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { computeSalesTaxReport } from "@/lib/reports/sales-tax-report";

/**
 * Sales tax report: tax collected on invoices issued in the period, by rate.
 *
 * Each invoice line is either taxable (it carries a tax rate that charges tax)
 * or exempt: no tax rate, an exempt / no-tax rate, or a customer marked
 * "Don't charge tax" with no tax on the line. Exempt lines are only counted
 * under Exempt Sales, never in the by-rate breakdown. All amounts are integer
 * cents in the organization's base currency field `currency`.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    return NextResponse.json(await computeSalesTaxReport(ctx.organizationId, startDate, endDate));
  } catch (err) {
    return handleError(err);
  }
}
