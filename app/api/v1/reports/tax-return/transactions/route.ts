import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getOrgTaxConfig, resolveBasis } from "@/lib/tax/ledger";
import { getReturnDefinition, resolveTaxModuleForOrg } from "@/lib/tax/registry";
import { drillBox } from "@/lib/tax/engine";

/**
 * Per-box drill-down for any return: the posted journal lines behind a box.
 *
 * Only boxes sourced from a ledger control account have lines to show (output and
 * input tax in every module). Boxes built from document subtotals are not
 * journal-line drillable and return a 400 naming the reason.
 *
 * Query params: kind, box (required); startDate + endDate, or periodId; basis.
 * The sum of each line's `amount` equals the box figure on the return.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const box = url.searchParams.get("box") || "";
    const kind = url.searchParams.get("kind") || "";
    const periodId = url.searchParams.get("periodId");
    let startDate = url.searchParams.get("startDate") || "";
    let endDate = url.searchParams.get("endDate") || "";

    if (!box) return NextResponse.json({ error: "box is required" }, { status: 400 });

    if (periodId) {
      const period = await db.query.taxPeriod.findFirst({
        where: and(
          eq(taxPeriod.id, periodId),
          eq(taxPeriod.organizationId, ctx.organizationId)
        ),
        columns: { startDate: true, endDate: true },
      });
      if (!period) return NextResponse.json({ error: "Tax period not found" }, { status: 404 });
      startDate = period.startDate;
      endDate = period.endDate;
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate (or periodId) are required" },
        { status: 400 }
      );
    }

    const module = await resolveTaxModuleForOrg(
      ctx.organizationId,
      url.searchParams.get("country")
    );
    const def = getReturnDefinition(module, kind || module.returns[0]?.kind || "");
    if (!def) {
      return NextResponse.json(
        { error: `Unknown return kind "${kind}" for ${module.country}` },
        { status: 400 }
      );
    }

    const config = await getOrgTaxConfig(ctx.organizationId);
    const basis = resolveBasis(url.searchParams.get("basis"), config);
    const drill = await drillBox(ctx.organizationId, def, box, { startDate, endDate }, basis);

    if (!drill) {
      return NextResponse.json(
        {
          error:
            "This box is not journal-line drillable — it comes from document subtotals or a tax computation, not a control account.",
        },
        { status: 400 }
      );
    }

    const total = drill.transactions.reduce((s, t) => s + t.amount, 0);
    return NextResponse.json({
      box,
      kind: def.kind,
      accountCode: drill.accountCode,
      period: { startDate, endDate },
      basis,
      total,
      count: drill.transactions.length,
      transactions: drill.transactions,
    });
  } catch (err) {
    return handleError(err);
  }
}
