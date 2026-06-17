import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, sql, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import {
  getOrgTaxConfig,
  resolveBasis,
  controlAccountMovement,
  computeEcSales,
} from "@/lib/reports/tax-return";

/**
 * VAT return (UK-style 9-box) for a period.
 *
 * Boxes 1 (output VAT) and 4 (input VAT) come from the ledger control accounts
 * (2200 / 1500) so they reflect every posting source — invoices, bills, the bank
 * "Categorize" flow, manual journals, credit/debit notes and corrections — not
 * just invoiceLine/billLine.taxAmount.
 *
 * Recognition basis: `?basis=cash|accrual` overrides the org's vatScheme
 * (organization.vatScheme). Accrual recognises VAT on the entry date; cash only
 * recognises entries that moved cash in the period (see lib/reports/tax-return).
 *
 * Boxes 8/9 (intra-community supplies/acquisitions) are now derived from
 * VAT-registered cross-border counterparties instead of hardcoded 0. Box 2 (EU
 * acquisitions VAT) remains 0 unless reverse-charge VAT is tagged (gap noted).
 *
 * Flat-rate scheme: pass `?flatRatePercent=<bp>` (e.g. 1450 = 14.5%) to compute
 * box 1 as the flat percentage of gross (VAT-inclusive) turnover with box 4
 * forced to 0 (standard flat-rate treatment). There is no flat-rate column on
 * the org this round, so the percentage must be supplied by the caller.
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

    const outputMovement = await controlAccountMovement(
      ctx.organizationId,
      "2200",
      startDate,
      endDate,
      basis
    );
    const inputMovement = await controlAccountMovement(
      ctx.organizationId,
      "1500",
      startDate,
      endDate,
      basis
    );

    // Box 6: Total sales ex-VAT (kept from document lines)
    const totalSales = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoice.subtotal}), 0)`.mapWith(Number) })
      .from(invoice)
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ));

    // Box 7: Total purchases ex-VAT (kept from document lines)
    const totalPurchases = await db
      .select({ total: sql<number>`COALESCE(SUM(${bill.subtotal}), 0)`.mapWith(Number) })
      .from(bill)
      .where(and(
        eq(bill.organizationId, ctx.organizationId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      ));

    // Gross (VAT-inclusive) turnover for the flat-rate computation.
    const grossSales = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoice.total}), 0)`.mapWith(Number) })
      .from(invoice)
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ));

    const ec = await computeEcSales(
      ctx.organizationId,
      startDate,
      endDate,
      config.country
    );

    const box6 = totalSales[0]?.total || 0;
    const box7 = totalPurchases[0]?.total || 0;
    const box8 = ec.ecSalesNet;
    const box9 = ec.ecAcquisitionsNet;

    let box1: number;
    let box4: number;
    if (flatRateApplied) {
      // Flat-rate: VAT due = flat % of gross (VAT-inclusive) turnover; input VAT
      // is not separately reclaimable (standard flat-rate scheme).
      const gross = grossSales[0]?.total || 0;
      box1 = Math.round((gross * flatRatePercent!) / 10000);
      box4 = 0;
    } else {
      box1 = outputMovement.credits - outputMovement.debits;
      box4 = inputMovement.debits - inputMovement.credits;
    }

    const box2 = 0; // EU acquisitions VAT — needs reverse-charge tagging (gap)
    const box3 = box1 + box2;
    const box5 = box3 - box4;

    const boxes = [
      { box: "1", label: "VAT due on sales", amount: box1 },
      { box: "2", label: "VAT due on EU acquisitions", amount: box2 },
      { box: "3", label: "Total VAT due (Box 1 + 2)", amount: box3 },
      { box: "4", label: "VAT reclaimed on purchases", amount: box4 },
      { box: "5", label: "Net VAT to pay/reclaim (Box 3 - 4)", amount: box5 },
      { box: "6", label: "Total sales ex-VAT", amount: box6 },
      { box: "7", label: "Total purchases ex-VAT", amount: box7 },
      { box: "8", label: "Total supplies to EU ex-VAT", amount: box8 },
      { box: "9", label: "Total acquisitions from EU ex-VAT", amount: box9 },
    ];

    return NextResponse.json({
      boxes,
      period: { startDate, endDate },
      basis,
      vatScheme: config.vatScheme,
      flatRate: flatRateApplied ? { applied: true, percentBp: flatRatePercent } : { applied: false },
    });
  } catch (err) {
    return handleError(err);
  }
}
