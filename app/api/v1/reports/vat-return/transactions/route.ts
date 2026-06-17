import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import {
  getOrgTaxConfig,
  resolveBasis,
  boxTransactions,
  isDrillableBox,
} from "@/lib/reports/tax-return";

/**
 * Per-box drill-down for the VAT return / BAS.
 *
 * Returns the underlying posted journal lines that make up a single box for the
 * period — the output VAT (2200) control lines for box 1 / 1A, or the input VAT
 * (1500) control lines for box 4 / 1B — with each line's entry context
 * (entry number, date, reference, sourceType) and account.
 *
 * Query params:
 *   box        required — "1" | "4" (VAT) or "1A" | "1B" (BAS)
 *   periodId   optional — a tax_period to resolve start/end (and basis default)
 *   startDate  optional — required if periodId is not supplied
 *   endDate    optional — required if periodId is not supplied
 *   basis      optional — "cash" | "accrual"; defaults to the org vatScheme
 *
 * The sum of each line's `amount` equals the box figure on the report. Boxes
 * sourced from document subtotals (6/7/8/9, G1/G2/...) are not journal-line
 * drillable and return a 400.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const box = url.searchParams.get("box") || "";
    const periodId = url.searchParams.get("periodId");
    let startDate = url.searchParams.get("startDate") || "";
    let endDate = url.searchParams.get("endDate") || "";

    if (!box) {
      return NextResponse.json({ error: "box is required" }, { status: 400 });
    }
    if (!isDrillableBox(box)) {
      return NextResponse.json(
        {
          error:
            "Box is not journal-line drillable. Only output VAT (1 / 1A) and input VAT (4 / 1B) boxes have underlying control-account lines.",
        },
        { status: 400 }
      );
    }

    // Resolve the period window from periodId when supplied.
    if (periodId) {
      const period = await db.query.taxPeriod.findFirst({
        where: and(
          eq(taxPeriod.id, periodId),
          eq(taxPeriod.organizationId, ctx.organizationId)
        ),
        columns: { startDate: true, endDate: true },
      });
      if (!period) {
        return NextResponse.json({ error: "Tax period not found" }, { status: 404 });
      }
      startDate = period.startDate;
      endDate = period.endDate;
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate (or periodId) are required" },
        { status: 400 }
      );
    }

    const config = await getOrgTaxConfig(ctx.organizationId);
    const basis = resolveBasis(url.searchParams.get("basis"), config);

    const transactions = await boxTransactions(
      ctx.organizationId,
      box,
      startDate,
      endDate,
      basis
    );

    const total = transactions.reduce((s, t) => s + t.amount, 0);

    return NextResponse.json({
      box,
      period: { startDate, endDate },
      basis,
      vatScheme: config.vatScheme,
      total,
      count: transactions.length,
      transactions,
    });
  } catch (err) {
    return handleError(err);
  }
}
