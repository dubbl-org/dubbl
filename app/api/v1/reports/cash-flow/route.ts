import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";
import {
  buildCashFlow,
  type CashFlowMethod,
  type CashFlowStatement,
} from "@/lib/reports/cash-flow";
import type { ReportBasis } from "@/lib/reports/gl-query";

function parseBasis(value: string | null): ReportBasis {
  return value === "cash" ? "cash" : "accrual";
}

function parseMethod(value: string | null): CashFlowMethod {
  return value === "direct" ? "direct" : "indirect";
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
    const method = parseMethod(url.searchParams.get("method"));

    const cf = await buildCashFlow(
      ctx.organizationId,
      { startDate, endDate },
      { method, basis }
    );

    // --- Backward-compatible flat sections -------------------------------
    // The original response exposed flat operating/investing/financing line
    // arrays with per-section totals + a `netCashFlow`. Preserve those exact
    // fields (now sourced from the authoritative builder) so existing callers
    // keep working, while ADDING the richer structured payload below.
    const operating = flattenOperating(cf);
    const investing = cf.investingActivities.items.map((i) => ({
      accountName: i.name,
      accountCode: i.code ?? "",
      amount: i.amount,
    }));
    const financing = cf.financingActivities.items.map((i) => ({
      accountName: i.name,
      accountCode: i.code ?? "",
      amount: i.amount,
    }));

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";
      const statement = buildStatement(cf, operating, investing, financing, currency);

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="cash-flow-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="cash-flow-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      startDate,
      endDate,
      // New: reporting controls echoed back.
      basis,
      method,
      // Backward-compatible flat sections + totals.
      operating,
      totalOperating: cf.operatingActivities.total,
      investing,
      totalInvesting: cf.investingActivities.total,
      financing,
      totalFinancing: cf.financingActivities.total,
      netCashFlow: cf.netCashChange,
      // New: authoritative structured statement (indirect/direct) + cash
      // balances and the closing-minus-opening reconciliation line.
      openingCashBalance: cf.openingCashBalance,
      closingCashBalance: cf.closingCashBalance,
      netCashChange: cf.netCashChange,
      operatingActivities: cf.operatingActivities,
      investingActivities: cf.investingActivities,
      financingActivities: cf.financingActivities,
      reconciliation: cf.reconciliation,
    });
  } catch (err) {
    return handleError(err);
  }
}

/** Flatten the operating section into the legacy line-array shape. */
function flattenOperating(cf: CashFlowStatement) {
  const op = cf.operatingActivities;
  const lines: { accountName: string; accountCode: string; amount: number }[] = [];
  if (cf.method === "direct") {
    lines.push({ accountName: "Cash receipts from customers", accountCode: "", amount: op.netIncome });
    lines.push({
      accountName: "Cash paid for operating expenses",
      accountCode: "",
      amount: op.total - op.netIncome,
    });
    return lines;
  }
  lines.push({ accountName: "Net income", accountCode: "", amount: op.netIncome });
  if (op.depreciation !== 0) {
    lines.push({ accountName: "Depreciation", accountCode: "", amount: op.depreciation });
  }
  lines.push({
    accountName: "Change in accounts receivable",
    accountCode: "",
    amount: op.workingCapitalChanges.accountsReceivable,
  });
  lines.push({
    accountName: "Change in accounts payable",
    accountCode: "",
    amount: op.workingCapitalChanges.accountsPayable,
  });
  lines.push({
    accountName: "Change in inventory",
    accountCode: "",
    amount: op.workingCapitalChanges.inventory,
  });
  return lines;
}

function buildStatement(
  cf: CashFlowStatement,
  operating: { accountName: string; accountCode: string; amount: number }[],
  investing: { accountName: string; accountCode: string; amount: number }[],
  financing: { accountName: string; accountCode: string; amount: number }[],
  currency: string
): Statement {
  const toRows = (
    items: { accountName: string; accountCode: string; amount: number }[]
  ) =>
    items.map((i) => ({
      code: i.accountCode || undefined,
      name: i.accountName,
      amount: i.amount,
      depth: 1,
    }));

  return {
    title: "Cash Flow Statement",
    periodLabel: `${cf.startDate} to ${cf.endDate} (${cf.method}, ${cf.basis} basis)`,
    currency,
    sections: [
      {
        label: "Operating Activities",
        rows: toRows(operating),
        subtotal: cf.operatingActivities.total,
      },
      {
        label: "Investing Activities",
        rows: toRows(investing),
        subtotal: cf.investingActivities.total,
      },
      {
        label: "Financing Activities",
        rows: toRows(financing),
        subtotal: cf.financingActivities.total,
      },
      {
        label: "Cash Reconciliation",
        rows: [
          { name: "Opening cash balance", amount: cf.openingCashBalance, depth: 1 },
          { name: "Net change in cash", amount: cf.netCashChange, depth: 1 },
          { name: "Closing cash balance", amount: cf.closingCashBalance, depth: 1, bold: true },
          {
            name: "Movement per cash accounts (closing − opening)",
            amount: cf.reconciliation.cashAccountMovement,
            depth: 1,
          },
          {
            name: "Unreconciled difference",
            amount: cf.reconciliation.difference,
            depth: 1,
            bold: true,
          },
        ],
      },
    ],
    grandTotal: cf.netCashChange,
  };
}
