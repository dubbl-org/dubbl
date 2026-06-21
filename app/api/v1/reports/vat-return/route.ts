import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, sql, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import {
  getOrgTaxConfig,
  resolveBasis,
  controlAccountMovement,
  computeEcSales,
  getControlAccountId,
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
 * acquisitions VAT) is derived from reverse-charge self-accounting: the buyer
 * posts the notional acquisition VAT as a CR to Output VAT (2200) on a purchase
 * entry that simultaneously DRs Input VAT (1500) — see
 * lib/api/journal-automation.ts. We sum the 2200 credits on exactly those
 * self-accounting entries (those that also touch 1500 with a debit), which
 * isolates reverse-charge output VAT from ordinary sales output VAT (the latter
 * never co-occurs with a 1500 debit on the same entry). Known partial: a fully
 * non-recoverable reverse charge (recoverablePercent = 0) posts no 1500 leg, so
 * it is not captured here (see TODO at the box2 query).
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

    // Box 2: EU/acquisitions reverse-charge VAT. The buyer self-accounts notional
    // VAT by crediting Output VAT (2200) on a purchase entry that also debits
    // Input VAT (1500) — see lib/api/journal-automation.ts. Summing the 2200
    // credits restricted to entries that carry a 1500 debit isolates
    // reverse-charge output VAT from ordinary sales output VAT (a sale never
    // debits 1500 on the same entry).
    //
    // This output VAT is part of the full 2200 movement that feeds Box 1, so we
    // subtract it from Box 1 and surface it in Box 2 instead — Box 3 (= Box 1 +
    // Box 2) and Box 5 are unchanged, but the acquisition VAT is now reported in
    // its own box rather than buried in "VAT due on sales".
    //
    // TODO: a fully non-recoverable reverse charge (recoverablePercent = 0) posts
    // no 1500 leg, so it is not captured here; tagging the reverse-charge output
    // leg explicitly (e.g. a journalLine kind / taxRate reference) would let us
    // include it. Basis note: this follows the posting/entry date (accrual); the
    // VAT side of a reverse charge is net-zero cash, so a cash-basis distinction
    // is not meaningful for box 2.
    const outputVatAccountId = await getControlAccountId(ctx.organizationId, "2200");
    const inputVatAccountId = await getControlAccountId(ctx.organizationId, "1500");
    let reverseChargeVat = 0;
    if (outputVatAccountId && inputVatAccountId) {
      const [row] = await db
        .select({
          credits: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.mapWith(Number),
          debits: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.mapWith(Number),
        })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
        .where(
          and(
            eq(journalLine.accountId, outputVatAccountId),
            eq(journalEntry.organizationId, ctx.organizationId),
            eq(journalEntry.status, "posted"),
            gte(journalEntry.date, startDate),
            lte(journalEntry.date, endDate),
            isNull(journalEntry.deletedAt),
            sql`exists (
              select 1 from ${journalLine} rc_input
              where rc_input.journal_entry_id = ${journalEntry.id}
                and rc_input.account_id = ${inputVatAccountId}
                and rc_input.debit_amount > 0
            )`
          )
        );
      reverseChargeVat = (row?.credits || 0) - (row?.debits || 0);
    }

    let box1: number;
    let box2: number;
    let box4: number;
    if (flatRateApplied) {
      // Flat-rate: VAT due = flat % of gross (VAT-inclusive) turnover; input VAT
      // is not separately reclaimable (standard flat-rate scheme). Reverse-charge
      // acquisitions are out of scope for the standard flat-rate calculation.
      const gross = grossSales[0]?.total || 0;
      box1 = Math.round((gross * flatRatePercent!) / 10000);
      box2 = 0;
      box4 = 0;
    } else {
      // The full 2200 movement includes reverse-charge output VAT; move that
      // slice into Box 2 so it is not double-counted in Box 3.
      box1 = outputMovement.credits - outputMovement.debits - reverseChargeVat;
      box2 = reverseChargeVat;
      box4 = inputMovement.debits - inputMovement.credits;
    }

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
