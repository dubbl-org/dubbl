import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill, organization } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import {
  aggregateByDateRange,
  aggregateAsAt,
  type ReportBasis,
} from "@/lib/reports/gl-query";
import type { Statement } from "@/lib/reports/statement-export";

/**
 * Executive Summary.
 *
 * A one-page KPI roll-up comparing the requested period against the immediately
 * preceding period of equal length. KPIs are derived from the shared GL
 * aggregation (revenue / expenses / net income / gross profit) plus
 * point-in-time balance-sheet figures (cash, AR, AP) and outstanding
 * receivables/payables from open invoices/bills.
 *
 * All amounts are integer cents.
 *
 * Query params:
 *   - startDate, endDate (ISO YYYY-MM-DD; default = current calendar year)
 *   - basis = accrual (default) | cash
 *   - format = json (default) | pdf | xlsx
 */

interface Kpi {
  key: string;
  label: string;
  current: number;
  prior: number;
  /** prior-period delta in cents (current - prior). */
  delta: number;
  /** percentage change vs prior (null when prior is 0). */
  deltaPercent: number | null;
}

/** Inclusive day count between two ISO dates. */
function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sum the natural-sign balances of aggregates of a given account type. */
function sumByType(
  aggs: { type: string; balance: number }[],
  type: string
): number {
  return aggs
    .filter((a) => a.type === type)
    .reduce((s, a) => s + a.balance, 0);
}

/** Sum cumulative balances on accounts whose subType is in the given set. */
function sumBySubType(
  aggs: { subType: string | null; balance: number }[],
  subTypes: string[]
): number {
  return aggs
    .filter((a) => a.subType !== null && subTypes.includes(a.subType))
    .reduce((s, a) => s + a.balance, 0);
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");

    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();
    const startDate =
      url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate =
      url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const basis: ReportBasis =
      url.searchParams.get("basis") === "cash" ? "cash" : "accrual";

    // Prior period: same length, immediately before the current window.
    const periodLen = daysBetween(startDate, endDate);
    const priorEnd = addDays(startDate, -1);
    const priorStart = addDays(priorEnd, -(periodLen - 1));

    // P&L activity for current + prior periods (revenue/expense only).
    const [currentPL, priorPL] = await Promise.all([
      aggregateByDateRange(
        ctx.organizationId,
        { startDate, endDate },
        { basis, accountTypes: ["revenue", "expense"] }
      ),
      aggregateByDateRange(
        ctx.organizationId,
        { startDate: priorStart, endDate: priorEnd },
        { basis, accountTypes: ["revenue", "expense"] }
      ),
    ]);

    // Point-in-time balances (cash) as at each period end.
    const [currentBS, priorBS] = await Promise.all([
      aggregateAsAt(ctx.organizationId, endDate, {
        basis,
        accountTypes: ["asset"],
      }),
      aggregateAsAt(ctx.organizationId, priorEnd, {
        basis,
        accountTypes: ["asset"],
      }),
    ]);

    const revenueCurrent = sumByType(currentPL, "revenue");
    const revenuePrior = sumByType(priorPL, "revenue");
    const expensesCurrent = sumByType(currentPL, "expense");
    const expensesPrior = sumByType(priorPL, "expense");

    // Gross profit = revenue - cost of sales (expense accounts subType 'cogs').
    const cogsCurrent = currentPL
      .filter((a) => a.type === "expense" && a.subType === "cogs")
      .reduce((s, a) => s + a.balance, 0);
    const cogsPrior = priorPL
      .filter((a) => a.type === "expense" && a.subType === "cogs")
      .reduce((s, a) => s + a.balance, 0);

    const netIncomeCurrent = revenueCurrent - expensesCurrent;
    const netIncomePrior = revenuePrior - expensesPrior;
    const grossProfitCurrent = revenueCurrent - cogsCurrent;
    const grossProfitPrior = revenuePrior - cogsPrior;

    const cashCurrent = sumBySubType(currentBS, ["bank"]);
    const cashPrior = sumBySubType(priorBS, ["bank"]);

    // Outstanding receivables / payables (open documents at each period end).
    const [openInvoices, openBills] = await Promise.all([
      db.query.invoice.findMany({
        where: and(
          eq(invoice.organizationId, ctx.organizationId),
          isNull(invoice.deletedAt),
          ne(invoice.status, "void"),
          ne(invoice.status, "draft")
        ),
        columns: { issueDate: true, amountDue: true },
      }),
      db.query.bill.findMany({
        where: and(
          eq(bill.organizationId, ctx.organizationId),
          isNull(bill.deletedAt),
          ne(bill.status, "void"),
          ne(bill.status, "draft")
        ),
        columns: { issueDate: true, amountDue: true },
      }),
    ]);

    const arAsOf = (asAt: string) =>
      openInvoices
        .filter((i) => i.issueDate <= asAt)
        .reduce((s, i) => s + i.amountDue, 0);
    const apAsOf = (asAt: string) =>
      openBills
        .filter((b) => b.issueDate <= asAt)
        .reduce((s, b) => s + b.amountDue, 0);

    const arCurrent = arAsOf(endDate);
    const arPrior = arAsOf(priorEnd);
    const apCurrent = apAsOf(endDate);
    const apPrior = apAsOf(priorEnd);

    const makeKpi = (
      key: string,
      label: string,
      current: number,
      prior: number
    ): Kpi => {
      const delta = current - prior;
      const deltaPercent =
        prior === 0 ? null : Math.round((delta / Math.abs(prior)) * 10000) / 100;
      return { key, label, current, prior, delta, deltaPercent };
    };

    const kpis: Kpi[] = [
      makeKpi("revenue", "Revenue", revenueCurrent, revenuePrior),
      makeKpi("grossProfit", "Gross Profit", grossProfitCurrent, grossProfitPrior),
      makeKpi("expenses", "Operating Expenses", expensesCurrent, expensesPrior),
      makeKpi("netIncome", "Net Income", netIncomeCurrent, netIncomePrior),
      makeKpi("cash", "Cash on Hand", cashCurrent, cashPrior),
      makeKpi("accountsReceivable", "Accounts Receivable", arCurrent, arPrior),
      makeKpi("accountsPayable", "Accounts Payable", apCurrent, apPrior),
    ];

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      const statement: Statement = {
        title: "Executive Summary",
        periodLabel: `${startDate} to ${endDate} (vs ${priorStart} to ${priorEnd})`,
        currency,
        columns: ["This Period", "Prior Period", "Change"],
        sections: [
          {
            label: "Key Metrics",
            rows: kpis.map((k) => ({
              name: k.label,
              amounts: [k.current, k.prior, k.delta],
              depth: 1,
            })),
          },
        ],
      };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="executive-summary-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="executive-summary-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      period: { startDate, endDate },
      priorPeriod: { startDate: priorStart, endDate: priorEnd },
      basis,
      kpis,
    });
  } catch (err) {
    return handleError(err);
  }
}
