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
 * Australian BAS (GST) for a period.
 *
 * 1A (GST on sales) and 1B (GST on purchases) come from the ledger control
 * accounts (2200 output, 1500 input) so they reflect every posting source, not
 * just document tax lines.
 *
 * Recognition basis: `?basis=cash|accrual` overrides the org's vatScheme
 * (organization.vatScheme). Most small AU businesses report GST on a cash basis;
 * cash only recognises entries that moved cash in the period (see
 * lib/reports/tax-return).
 *
 * G2 (export / cross-border sales) is now derived from VAT/GST-registered
 * cross-border counterparties instead of hardcoded 0. G3 (other GST-free sales)
 * still requires per-line GST-free tagging to populate (gap noted).
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

    const config = await getOrgTaxConfig(ctx.organizationId);
    const basis = resolveBasis(url.searchParams.get("basis"), config);

    // G1: Total sales (incl GST) — kept from documents
    const totalSales = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoice.total}), 0)`.mapWith(Number) })
      .from(invoice)
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ));

    // Total purchases (incl GST) — kept from documents
    const totalPurchases = await db
      .select({ total: sql<number>`COALESCE(SUM(${bill.total}), 0)`.mapWith(Number) })
      .from(bill)
      .where(and(
        eq(bill.organizationId, ctx.organizationId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      ));

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

    // G2 (exports): cross-border sales to a tax-registered counterparty. Derived
    // from contact country + taxNumber (best-effort, ex-GST subtotal).
    const ec = await computeEcSales(
      ctx.organizationId,
      startDate,
      endDate,
      config.country
    );

    const g1 = totalSales[0]?.total || 0;
    const oneA = outputMovement.credits - outputMovement.debits;
    const g11 = totalPurchases[0]?.total || 0;
    const oneB = inputMovement.debits - inputMovement.credits;
    const g2 = ec.ecSalesNet;

    const fields = [
      { field: "G1", label: "Total sales (including GST)", amount: g1 },
      { field: "G2", label: "Export sales", amount: g2 },
      { field: "G3", label: "Other GST-free sales", amount: 0 },
      { field: "G10", label: "Capital purchases", amount: 0 },
      { field: "G11", label: "Non-capital purchases", amount: g11 },
      { field: "1A", label: "GST on sales", amount: oneA },
      { field: "1B", label: "GST on purchases", amount: oneB },
      { field: "NET", label: "Net GST (1A - 1B)", amount: oneA - oneB },
    ];

    return NextResponse.json({
      fields,
      period: { startDate, endDate },
      basis,
      vatScheme: config.vatScheme,
    });
  } catch (err) {
    return handleError(err);
  }
}
