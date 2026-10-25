import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getTaxReturn } from "@/lib/tax/return-service";
import { AU_MODULE } from "@/lib/tax/modules/eu-vat";

/**
 * Australian BAS (GST). Adapter over lib/tax/return-service with the AU module
 * forced, keeping the existing field list and numbers. New integrations should
 * use `/api/v1/reports/tax-return?kind=bas&country=AU`.
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

    const { result, vatScheme } = await getTaxReturn(ctx.organizationId, {
      module: AU_MODULE,
      kind: "bas",
      startDate,
      endDate,
      basis: url.searchParams.get("basis"),
    });

    return NextResponse.json({
      fields: result.boxes.map((b) => ({ field: b.box, label: b.label, amount: b.amount })),
      period: result.period,
      basis: result.basis,
      vatScheme,
    });
  } catch (err) {
    return handleError(err);
  }
}
