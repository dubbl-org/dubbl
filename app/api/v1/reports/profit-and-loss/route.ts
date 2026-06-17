import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import type { Statement, StatementRow } from "@/lib/reports/statement-export";
import {
  aggregateByDateRange,
  type AccountAggregate,
  type ReportBasis,
} from "@/lib/reports/gl-query";

interface PLAccount {
  accountId: string;
  accountName: string;
  accountCode: string;
  balance: number;
}

interface PLPeriod {
  startDate: string;
  endDate: string;
  revenue: PLAccount[];
  totalRevenue: number;
  expenses: PLAccount[];
  totalExpenses: number;
  netIncome: number;
}

function parseBasis(value: string | null): ReportBasis {
  return value === "cash" ? "cash" : "accrual";
}

/** Split a P&L aggregation into revenue / expense sections + totals. */
function toPeriod(
  startDate: string,
  endDate: string,
  accounts: AccountAggregate[]
): PLPeriod {
  const revenue: PLAccount[] = [];
  const expenses: PLAccount[] = [];

  for (const a of accounts) {
    const line: PLAccount = {
      accountId: a.accountId,
      accountName: a.name,
      accountCode: a.code,
      // gl-query already natural-signs: revenue = credit−debit, expense = debit−credit.
      balance: a.balance,
    };
    if (a.type === "revenue") revenue.push(line);
    else if (a.type === "expense") expenses.push(line);
  }

  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
  return {
    startDate,
    endDate,
    revenue,
    totalRevenue,
    expenses,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    // Reports are a read of ledger data; gate on the standard read permission
    // (`view:reports` is not a defined permission, so using it would 403 every
    // non-owner and regress access).
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();
    const startDate =
      url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate =
      url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const basis = parseBasis(url.searchParams.get("basis"));

    // Optional comparative period (both bounds required to activate).
    const compareFrom = url.searchParams.get("compareFrom");
    const compareTo = url.searchParams.get("compareTo");
    const hasComparison = Boolean(compareFrom && compareTo);

    const primaryAccounts = await aggregateByDateRange(
      ctx.organizationId,
      { startDate, endDate },
      { basis, accountTypes: ["revenue", "expense"] }
    );
    const primary = toPeriod(startDate, endDate, primaryAccounts);

    let comparison: PLPeriod | undefined;
    if (hasComparison) {
      const cmpAccounts = await aggregateByDateRange(
        ctx.organizationId,
        { startDate: compareFrom!, endDate: compareTo! },
        { basis, accountTypes: ["revenue", "expense"] }
      );
      comparison = toPeriod(compareFrom!, compareTo!, cmpAccounts);
    }

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";
      const statement = buildStatement(primary, comparison, basis, currency);

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="profit-and-loss-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="profit-and-loss-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    // Backward-compatible top-level fields are the primary period's figures.
    return NextResponse.json({
      startDate,
      endDate,
      basis,
      revenue: primary.revenue,
      totalRevenue: primary.totalRevenue,
      expenses: primary.expenses,
      totalExpenses: primary.totalExpenses,
      netIncome: primary.netIncome,
      // New: comparative period (present only when compareFrom/compareTo given).
      ...(comparison ? { comparison } : {}),
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Build a Statement for export. Single-column when there is no comparison;
 * multi-column (current vs prior) when a comparison period is supplied.
 */
function buildStatement(
  primary: PLPeriod,
  comparison: PLPeriod | undefined,
  basis: ReportBasis,
  currency: string
): Statement {
  const periodLabel = `${primary.startDate} to ${primary.endDate} (${basis} basis)`;

  if (!comparison) {
    return {
      title: "Profit and Loss",
      periodLabel,
      currency,
      sections: [
        {
          label: "Revenue",
          rows: primary.revenue.map((r) => ({
            code: r.accountCode,
            name: r.accountName,
            amount: r.balance,
            depth: 1,
          })),
          subtotal: primary.totalRevenue,
        },
        {
          label: "Expenses",
          rows: primary.expenses.map((e) => ({
            code: e.accountCode,
            name: e.accountName,
            amount: e.balance,
            depth: 1,
          })),
          subtotal: primary.totalExpenses,
        },
      ],
      grandTotal: primary.netIncome,
    };
  }

  // Multi-column: align comparison accounts to the primary accounts by id, then
  // append any accounts present only in the comparison period.
  const columns = [
    `${primary.startDate} to ${primary.endDate}`,
    `${comparison.startDate} to ${comparison.endDate}`,
  ];

  const buildRows = (
    primaryLines: PLAccount[],
    comparisonLines: PLAccount[]
  ): StatementRow[] => {
    const cmpById = new Map(comparisonLines.map((l) => [l.accountId, l]));
    const seen = new Set<string>();
    const rows: StatementRow[] = [];
    for (const p of primaryLines) {
      seen.add(p.accountId);
      const c = cmpById.get(p.accountId);
      rows.push({
        code: p.accountCode,
        name: p.accountName,
        amounts: [p.balance, c?.balance ?? 0],
        depth: 1,
      });
    }
    for (const c of comparisonLines) {
      if (seen.has(c.accountId)) continue;
      rows.push({
        code: c.accountCode,
        name: c.accountName,
        amounts: [0, c.balance],
        depth: 1,
      });
    }
    return rows;
  };

  return {
    title: "Profit and Loss",
    periodLabel,
    currency,
    columns,
    sections: [
      {
        label: "Revenue",
        rows: buildRows(primary.revenue, comparison.revenue),
        subtotals: [primary.totalRevenue, comparison.totalRevenue],
      },
      {
        label: "Expenses",
        rows: buildRows(primary.expenses, comparison.expenses),
        subtotals: [primary.totalExpenses, comparison.totalExpenses],
      },
    ],
    grandTotals: [primary.netIncome, comparison.netIncome],
  };
}
