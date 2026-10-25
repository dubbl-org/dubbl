import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getTaxReturn } from "@/lib/tax/return-service";

/**
 * Generic tax return endpoint: `?kind=gst_f5|vat100|bas|form_c_s|eci|…`
 *
 * The module is resolved from the org's country (or `?country=SG`), and the box
 * definitions live in lib/tax/modules. Unknown kinds return a 400 listing what
 * the module does offer.
 *
 * Query params:
 *   kind         return kind; defaults to the module's first return
 *   startDate    required
 *   endDate      required
 *   basis        "accrual" | "cash" — only where the module supports it
 *   country      optional ISO code override
 *   periodId     optional tax_period; supplies persisted manual box values
 *   basis        see above
 *   format       "json" (default) | "xlsx" (workpaper)
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

    const response = await getTaxReturn(ctx.organizationId, {
      kind: url.searchParams.get("kind"),
      country: url.searchParams.get("country"),
      periodId: url.searchParams.get("periodId"),
      startDate,
      endDate,
      basis: url.searchParams.get("basis"),
    });

    return NextResponse.json({
      ...response.result,
      vatScheme: response.vatScheme,
      availableKinds: response.module.returns.map((r) => ({
        kind: r.kind,
        title: r.title,
        bases: r.bases,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
