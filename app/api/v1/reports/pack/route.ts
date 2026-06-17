import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import {
  aggregateByDateRange,
  aggregateAsAt,
  type AccountAggregate,
  type ReportBasis,
} from "@/lib/reports/gl-query";
import type { Statement } from "@/lib/reports/statement-export";

/**
 * Report Pack.
 *
 * Bundles the core financial statements for a period into a single download:
 *   1. Balance Sheet      (cumulative balances as at endDate)
 *   2. Profit & Loss      (revenue/expense activity over the period)
 *   3. Trial Balance      (all accounts, cumulative debit/credit as at endDate)
 *   4. Cash Flow Summary  (opening/closing cash + net change over the period)
 *
 * All figures come from the shared GL aggregation (lib/reports/gl-query) so the
 * pack stays consistent with the standalone reports. Amounts are integer cents.
 *
 * Query params:
 *   - startDate, endDate (ISO YYYY-MM-DD; default = current calendar year)
 *   - basis = accrual (default) | cash
 *   - format = xlsx (default; multi-sheet workbook) | json (per-statement
 *     structure so a client can render its own layout)
 */

/** chartAccount.subType values treated as cash/bank for the cash-flow summary. */
const CASH_SUBTYPES = ["bank"];

function sumBalances(aggs: AccountAggregate[]): number {
  return aggs.reduce((s, a) => s + a.balance, 0);
}

function sumCash(aggs: AccountAggregate[]): number {
  return aggs
    .filter((a) => a.subType !== null && CASH_SUBTYPES.includes(a.subType))
    .reduce((s, a) => s + a.balance, 0);
}

/** Map account aggregates of a given type into statement rows. */
function rowsForType(
  aggs: AccountAggregate[],
  type: AccountAggregate["type"]
) {
  return aggs
    .filter((a) => a.type === type)
    .map((a) => ({
      code: a.code,
      name: a.name,
      amount: a.balance,
      depth: 1,
    }));
}

function buildBalanceSheet(
  asAt: AccountAggregate[],
  netIncome: number,
  currency: string,
  endDate: string
): Statement {
  const assetRows = rowsForType(asAt, "asset");
  const liabilityRows = rowsForType(asAt, "liability");
  const equityRows = rowsForType(asAt, "equity");

  const totalAssets = assetRows.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.amount, 0);
  const totalEquityAccounts = equityRows.reduce((s, r) => s + r.amount, 0);

  // Current-period earnings are carried into equity so the sheet balances,
  // mirroring the standalone balance sheet's net-income handling.
  const equityWithEarnings = [
    ...equityRows,
    { code: "", name: "Current Earnings", amount: netIncome, depth: 1 },
  ];
  const totalEquity = totalEquityAccounts + netIncome;

  return {
    title: "Balance Sheet",
    periodLabel: `As at ${endDate}`,
    currency,
    sections: [
      { label: "Assets", rows: assetRows, subtotal: totalAssets },
      {
        label: "Liabilities",
        rows: liabilityRows,
        subtotal: totalLiabilities,
      },
      {
        label: "Equity",
        rows: equityWithEarnings,
        subtotal: totalEquity,
      },
    ],
    grandTotal: totalLiabilities + totalEquity,
  };
}

function buildProfitAndLoss(
  pl: AccountAggregate[],
  currency: string,
  startDate: string,
  endDate: string
): Statement {
  const revenueRows = rowsForType(pl, "revenue");
  const expenseRows = rowsForType(pl, "expense");
  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);

  return {
    title: "Profit and Loss",
    periodLabel: `${startDate} to ${endDate}`,
    currency,
    sections: [
      { label: "Revenue", rows: revenueRows, subtotal: totalRevenue },
      { label: "Expenses", rows: expenseRows, subtotal: totalExpenses },
    ],
    grandTotal: totalRevenue - totalExpenses,
  };
}

function buildTrialBalance(
  asAt: AccountAggregate[],
  currency: string,
  endDate: string
): Statement {
  // Trial balance shows the residual debit/credit balance per account. We
  // re-derive debit/credit columns from the natural-sign balance so each side
  // sums independently and the totals tie out.
  const rows = asAt
    .filter((a) => a.balance !== 0)
    .map((a) => {
      const debitNormal = a.type === "asset" || a.type === "expense";
      const debit = debitNormal
        ? Math.max(a.balance, 0)
        : Math.max(-a.balance, 0);
      const credit = debitNormal
        ? Math.max(-a.balance, 0)
        : Math.max(a.balance, 0);
      return { code: a.code, name: a.name, debit, credit, depth: 1 };
    });

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  return {
    title: "Trial Balance",
    periodLabel: `As at ${endDate}`,
    currency,
    columns: ["Debit", "Credit"],
    sections: [
      {
        label: "Accounts",
        rows: rows.map((r) => ({
          code: r.code,
          name: r.name,
          amounts: [r.debit, r.credit],
          depth: 1,
        })),
        subtotals: [totalDebit, totalCredit],
      },
    ],
    grandTotals: [totalDebit, totalCredit],
  };
}

function buildCashFlow(
  openingCash: number,
  closingCash: number,
  netIncome: number,
  currency: string,
  startDate: string,
  endDate: string
): Statement {
  const netChange = closingCash - openingCash;
  return {
    title: "Cash Flow Summary",
    periodLabel: `${startDate} to ${endDate}`,
    currency,
    sections: [
      {
        label: "Cash Movement",
        rows: [
          { name: "Opening cash", amount: openingCash, depth: 1 },
          { name: "Net change in cash", amount: netChange, depth: 1 },
          { name: "Closing cash", amount: closingCash, depth: 1, bold: true },
        ],
      },
      {
        label: "Reconciliation",
        rows: [
          { name: "Net income (period)", amount: netIncome, depth: 1 },
          {
            name: "Net non-cash & working-capital movement",
            amount: netChange - netIncome,
            depth: 1,
          },
        ],
        subtotal: netChange,
      },
    ],
    grandTotal: closingCash,
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");

    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
    const startDate =
      url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate =
      url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const basis: ReportBasis =
      url.searchParams.get("basis") === "cash" ? "cash" : "accrual";

    // Opening cash = day before the period start.
    const openingAsAt = new Date(startDate);
    openingAsAt.setDate(openingAsAt.getDate() - 1);
    const openingAsAtStr = openingAsAt.toISOString().slice(0, 10);

    const [pl, balancesAsAt, openingBalances] = await Promise.all([
      aggregateByDateRange(
        ctx.organizationId,
        { startDate, endDate },
        { basis, accountTypes: ["revenue", "expense"] }
      ),
      aggregateAsAt(ctx.organizationId, endDate, {
        basis,
        accountTypes: ["asset", "liability", "equity"],
        includeEmptyAccounts: true,
      }),
      aggregateAsAt(ctx.organizationId, openingAsAtStr, {
        basis,
        accountTypes: ["asset"],
      }),
    ]);

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: { defaultCurrency: true },
    });
    const currency = org?.defaultCurrency || "USD";

    const totalRevenue = sumBalances(pl.filter((a) => a.type === "revenue"));
    const totalExpenses = sumBalances(pl.filter((a) => a.type === "expense"));
    const netIncome = totalRevenue - totalExpenses;

    const closingCash = sumCash(balancesAsAt);
    const openingCash = sumCash(openingBalances);

    const balanceSheet = buildBalanceSheet(
      balancesAsAt,
      netIncome,
      currency,
      endDate
    );
    const profitAndLoss = buildProfitAndLoss(pl, currency, startDate, endDate);
    const trialBalance = buildTrialBalance(balancesAsAt, currency, endDate);
    const cashFlow = buildCashFlow(
      openingCash,
      closingCash,
      netIncome,
      currency,
      startDate,
      endDate
    );

    const statements: Statement[] = [
      balanceSheet,
      profitAndLoss,
      trialBalance,
      cashFlow,
    ];

    if (format === "json") {
      return NextResponse.json({
        startDate,
        endDate,
        basis,
        currency,
        statements,
      });
    }

    const { toWorkbookXlsx } = await import("@/lib/reports/statements-workbook");
    const buffer = await toWorkbookXlsx(statements);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-pack-${startDate}-${endDate}.xlsx"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
