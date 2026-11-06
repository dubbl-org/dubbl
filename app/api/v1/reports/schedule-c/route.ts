import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { aggregateByDateRange } from "@/lib/reports/gl-query";
import { buildScheduleC } from "@/lib/tax/schedule-c";

/**
 * IRS Schedule C worksheet for a period. Revenue and expense accounts are
 * mapped to Schedule C lines by sub type, type and name (see
 * lib/tax/schedule-c.ts), so the standard charts work without setup.
 * `?basis=cash|accrual` (default accrual) picks the accounting method. All
 * amounts are integer cents in `currency`.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    const basis = url.searchParams.get("basis") === "cash" ? "cash" : "accrual";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const [accounts, org] = await Promise.all([
      aggregateByDateRange(ctx.organizationId, { startDate, endDate }, { basis, accountTypes: ["revenue", "expense"] }),
      db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      }),
    ]);

    const result = buildScheduleC(accounts);
    return NextResponse.json({
      ...result,
      basis,
      currency: org?.defaultCurrency ?? "USD",
      period: { startDate, endDate },
    });
  } catch (err) {
    return handleError(err);
  }
}
