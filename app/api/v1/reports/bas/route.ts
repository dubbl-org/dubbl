import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getOrgTaxConfig, resolveBasis, computeBas } from "@/lib/reports/tax-return";

/**
 * Australian BAS (GST) for a period.
 *
 * 1A (GST on sales) and 1B (GST on purchases) come from the ledger control
 * accounts (2200 output, 1500 input) so they reflect every posting source, not
 * just document tax lines.
 *
 * The G fields come from the documents, in the base currency, net of credit /
 * debit notes: G1 total sales including GST; G2 exports (sales to registered
 * businesses abroad); G3 other GST-free sales (sale lines with no GST that are
 * not exports); G10 capital purchases (bill lines coded to fixed-asset
 * accounts, including GST); G11 the other purchases including GST.
 *
 * Recognition basis: `?basis=cash|accrual` overrides the org's vatScheme
 * (organization.vatScheme). Most small AU businesses report GST on a cash
 * basis, which recognises invoices and bills pro rata to the payments made in
 * the period (see lib/reports/tax-return).
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

    const config = await getOrgTaxConfig(ctx.organizationId);
    const basis = resolveBasis(url.searchParams.get("basis"), config);
    const { fields } = await computeBas(ctx.organizationId, startDate, endDate, basis, config);

    return NextResponse.json({
      fields,
      period: { startDate, endDate },
      basis,
      vatScheme: config.vatScheme,
      currency: config.baseCurrency,
    });
  } catch (err) {
    return handleError(err);
  }
}
