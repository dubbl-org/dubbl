import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getOrgTaxConfig, resolveBasis, computeVatReturn } from "@/lib/reports/tax-return";

/**
 * VAT return (UK-style 9-box) for a period.
 *
 * Boxes 1 (output VAT), 2 (reverse-charge VAT) and 4 (input VAT) come from the
 * ledger control accounts (2200 / 1500) so they reflect every posting source:
 * invoices, bills, the bank "Categorize" flow, manual journals, credit/debit
 * notes and corrections. Box 2 is the output VAT self-accounted on reverse-
 * charge purchases (entries that credit 2200 and debit 1500 together); Box 1
 * is the rest, so Box 3 equals the whole output VAT movement.
 *
 * Boxes 6 to 9 come from the documents: sales and purchases ex-VAT net of
 * credit / debit notes (sales receipts included), in the base currency.
 * Boxes 8/9 are the cross-border part (VAT-registered counterparties in
 * another country).
 *
 * Recognition basis: `?basis=cash|accrual` overrides the org's vatScheme
 * (organization.vatScheme). Accrual recognises VAT on the entry / issue date;
 * cash recognises invoices and bills pro rata to the payments made in the
 * period (see lib/reports/tax-return.ts).
 *
 * Flat-rate scheme: pass `?flatRatePercent=<bp>` (e.g. 1450 = 14.5%) to compute
 * box 1 as the flat percentage of gross (VAT-inclusive) turnover with box 4
 * forced to 0 (standard flat-rate treatment). There is no flat-rate column on
 * the org, so the percentage must be supplied by the caller.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    const flatRatePercentParam = url.searchParams.get("flatRatePercent");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const config = await getOrgTaxConfig(ctx.organizationId);
    const basis = resolveBasis(url.searchParams.get("basis"), config);

    const flatRatePercent =
      flatRatePercentParam != null && flatRatePercentParam !== ""
        ? Number(flatRatePercentParam)
        : null;
    const flatRateApplied =
      flatRatePercent != null && Number.isFinite(flatRatePercent) && flatRatePercent > 0;

    const { boxes } = await computeVatReturn(ctx.organizationId, startDate, endDate, basis, {
      flatRatePercent: flatRateApplied ? flatRatePercent : null,
      config,
    });

    return NextResponse.json({
      boxes,
      period: { startDate, endDate },
      basis,
      vatScheme: config.vatScheme,
      currency: config.baseCurrency,
      flatRate: flatRateApplied ? { applied: true, percentBp: flatRatePercent } : { applied: false },
    });
  } catch (err) {
    return handleError(err);
  }
}
