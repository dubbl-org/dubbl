import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { build1099Report, FORM_1099_NEC_THRESHOLD_CENTS } from "@/lib/api/tax-profiles";

/**
 * GET /api/v1/reports/1099?year=2025[&threshold=60000]
 *
 * US 1099-NEC/MISC vendor summary: aggregates non-card supplier payments made
 * to each 1099 vendor (contact.is1099Vendor) during the calendar tax year, on a
 * cash basis. Card payments are excluded (reported on 1099-K by the processor).
 * All amounts in integer cents. Defaults to the prior calendar year.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);

    const yearParam = url.searchParams.get("year");
    const year = yearParam
      ? parseInt(yearParam, 10)
      : new Date().getFullYear() - 1;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "year must be a 4-digit calendar year" },
        { status: 400 }
      );
    }

    const thresholdParam = url.searchParams.get("threshold");
    let threshold = FORM_1099_NEC_THRESHOLD_CENTS;
    if (thresholdParam != null) {
      const t = parseInt(thresholdParam, 10);
      if (!Number.isInteger(t) || t < 0) {
        return NextResponse.json(
          { error: "threshold must be a non-negative integer (cents)" },
          { status: 400 }
        );
      }
      threshold = t;
    }

    const report = await build1099Report(ctx.organizationId, year, threshold);
    return NextResponse.json(report);
  } catch (err) {
    return handleError(err);
  }
}
