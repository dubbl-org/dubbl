import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getTaxReturn } from "@/lib/tax/return-service";
import { GB_MODULE } from "@/lib/tax/modules/eu-vat";

/**
 * VAT return (UK 9-box). Adapter over lib/tax/return-service with the GB module
 * forced, so the response shape and the numbers are exactly what they were
 * before the registry existed. New integrations should use
 * `/api/v1/reports/tax-return?kind=vat100`.
 *
 * Boxes 1/4 come from the ledger control accounts (2200/1500); box 2 is
 * reverse-charge VAT self-accounted onto 2200, subtracted out of box 1; boxes
 * 8/9 are VAT-registered cross-border counterparties. `?flatRatePercent=<bp>`
 * applies the flat-rate scheme (box 1 = flat % of gross turnover, box 4 = 0).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    const flatRateParam = url.searchParams.get("flatRatePercent");
    const flatRatePercent =
      flatRateParam != null && flatRateParam !== "" ? Number(flatRateParam) : null;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const { result, vatScheme, flatRate } = await getTaxReturn(ctx.organizationId, {
      module: GB_MODULE,
      kind: "vat100",
      startDate,
      endDate,
      basis: url.searchParams.get("basis"),
      flatRatePercent,
    });

    return NextResponse.json({
      boxes: result.boxes.map((b) => ({ box: b.box, label: b.label, amount: b.amount })),
      period: result.period,
      basis: result.basis,
      vatScheme,
      flatRate: flatRate.applied
        ? { applied: true, percentBp: flatRate.percentBp }
        : { applied: false },
    });
  } catch (err) {
    return handleError(err);
  }
}
