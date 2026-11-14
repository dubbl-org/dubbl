import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { resolveTaxModuleForOrg } from "@/lib/tax/registry";

/**
 * The returns this org's jurisdiction offers, for the tax tabs and the reports
 * catalogue. Kept separate from the return itself so a page can render the tab
 * list without computing boxes.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const module = await resolveTaxModuleForOrg(
      ctx.organizationId,
      url.searchParams.get("country")
    );

    return NextResponse.json({
      country: module.country,
      countryName: module.countryName,
      taxName: module.taxName,
      regime: module.regime,
      currencyRule: module.currencyRule,
      xbrl: module.xbrl ?? null,
      fsPresentation: module.fsPresentation
        ? { incomeStatement: module.fsPresentation.incomeStatement }
        : null,
      returns: module.returns.map((r) => ({
        kind: r.kind,
        title: r.title,
        authority: r.authority,
        bases: r.bases,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
