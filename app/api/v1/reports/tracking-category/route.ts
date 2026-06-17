import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { costCenter, project, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";
import {
  aggregateByDimension,
  type Dimension,
  type ReportBasis,
  type DimensionGroup,
  type AccountAggregate,
} from "@/lib/reports/gl-query";

/**
 * Tracking-category report.
 *
 * Compares activity across a tracking dimension (cost center or project) by
 * laying out one amount column per dimension value for a date range. Two modes:
 *   - `mode=pnl` (default): revenue & expense sections + a Net Income row,
 *     one column per cost center / project.
 *   - `mode=balances`: every account type, natural-sign balance per column.
 *
 * The JSON response includes account ids per row so the UI can drill down into
 * the general-ledger report (which accepts the same ?costCenterId / ?projectId
 * filter).
 *
 * All amounts are integer cents. Posted, non-deleted entries only (handled by
 * the shared gl-query aggregation). Org-scoped via the auth context.
 */

/** Column key used for the null/unassigned dimension bucket. */
const UNASSIGNED_KEY = "__none__";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);

    const format = (url.searchParams.get("format") || "json").toLowerCase();
    const startDate =
      url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate =
      url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);

    const dimensionParam = (
      url.searchParams.get("dimension") || "costCenterId"
    ).trim();
    const dimension: Dimension =
      dimensionParam === "projectId" || dimensionParam === "project"
        ? "projectId"
        : "costCenterId";

    const mode =
      (url.searchParams.get("mode") || "pnl").toLowerCase() === "balances"
        ? "balances"
        : "pnl";

    const basis: ReportBasis =
      (url.searchParams.get("basis") || "accrual").toLowerCase() === "cash"
        ? "cash"
        : "accrual";

    const accountTypes: AccountAggregate["type"][] =
      mode === "pnl"
        ? ["revenue", "expense"]
        : ["asset", "liability", "equity", "revenue", "expense"];

    // Aggregate per dimension value AND account for the period.
    const groups: DimensionGroup[] = await aggregateByDimension(
      ctx.organizationId,
      { startDate, endDate },
      dimension,
      { basis, accountTypes }
    );

    // Resolve human labels for each dimension value (cost center code+name or
    // project name). Only the values that actually appear in the data are
    // looked up.
    const labels = await resolveLabels(
      ctx.organizationId,
      dimension,
      groups
        .map((g) => g.dimensionValue)
        .filter((v): v is string => v !== null)
    );

    // Stable column ordering: real dimension values sorted by label, then the
    // unassigned bucket last (only if it has any activity).
    const realKeys = groups
      .filter((g) => g.dimensionValue !== null)
      .map((g) => g.dimensionValue as string)
      .sort((a, b) =>
        (labels.get(a) || a).localeCompare(labels.get(b) || b)
      );
    const hasUnassigned = groups.some((g) => g.dimensionValue === null);
    const columnKeys = [...realKeys, ...(hasUnassigned ? [UNASSIGNED_KEY] : [])];

    const columns = columnKeys.map((key) =>
      key === UNASSIGNED_KEY ? "Unassigned" : labels.get(key) || key
    );

    // Index aggregates by columnKey -> accountId -> aggregate for fast lookup.
    const byColumn = new Map<string, Map<string, AccountAggregate>>();
    for (const g of groups) {
      const key = g.dimensionValue === null ? UNASSIGNED_KEY : g.dimensionValue;
      const acctMap =
        byColumn.get(key) || new Map<string, AccountAggregate>();
      for (const a of g.accounts) acctMap.set(a.accountId, a);
      byColumn.set(key, acctMap);
    }

    // Collect the union of accounts (preserving code order) split by type.
    const accountMeta = new Map<
      string,
      {
        accountId: string;
        code: string;
        name: string;
        type: AccountAggregate["type"];
      }
    >();
    for (const g of groups) {
      for (const a of g.accounts) {
        if (!accountMeta.has(a.accountId)) {
          accountMeta.set(a.accountId, {
            accountId: a.accountId,
            code: a.code,
            name: a.name,
            type: a.type,
          });
        }
      }
    }
    const orderedAccounts = Array.from(accountMeta.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );

    // Per-account, per-column balance (natural sign).
    const balanceFor = (accountId: string, columnKey: string): number =>
      byColumn.get(columnKey)?.get(accountId)?.balance ?? 0;

    // Build typed account-row sets with per-column amounts + drill-down ids.
    interface AccountRow {
      accountId: string;
      accountCode: string;
      accountName: string;
      accountType: AccountAggregate["type"];
      amounts: number[]; // aligned to columnKeys
      total: number;
    }
    const buildRows = (types: AccountAggregate["type"][]): AccountRow[] =>
      orderedAccounts
        .filter((a) => types.includes(a.type))
        .map((a) => {
          const amounts = columnKeys.map((k) => balanceFor(a.accountId, k));
          return {
            accountId: a.accountId,
            accountCode: a.code,
            accountName: a.name,
            accountType: a.type,
            amounts,
            total: amounts.reduce((s, n) => s + n, 0),
          };
        });

    const sumColumns = (rows: AccountRow[]): number[] =>
      columnKeys.map((_, i) => rows.reduce((s, r) => s + r.amounts[i], 0));

    let sectionsJson: Array<{
      label: string;
      accounts: AccountRow[];
      totals: number[];
      total: number;
    }>;
    let netByColumn: number[] | undefined;
    let netTotal: number | undefined;

    if (mode === "pnl") {
      const revenueRows = buildRows(["revenue"]);
      const expenseRows = buildRows(["expense"]);
      const revenueTotals = sumColumns(revenueRows);
      const expenseTotals = sumColumns(expenseRows);
      netByColumn = columnKeys.map((_, i) => revenueTotals[i] - expenseTotals[i]);
      netTotal = netByColumn.reduce((s, n) => s + n, 0);
      sectionsJson = [
        {
          label: "Revenue",
          accounts: revenueRows,
          totals: revenueTotals,
          total: revenueTotals.reduce((s, n) => s + n, 0),
        },
        {
          label: "Expenses",
          accounts: expenseRows,
          totals: expenseTotals,
          total: expenseTotals.reduce((s, n) => s + n, 0),
        },
      ];
    } else {
      const sectionDefs: Array<{
        label: string;
        types: AccountAggregate["type"][];
      }> = [
        { label: "Assets", types: ["asset"] },
        { label: "Liabilities", types: ["liability"] },
        { label: "Equity", types: ["equity"] },
        { label: "Revenue", types: ["revenue"] },
        { label: "Expenses", types: ["expense"] },
      ];
      sectionsJson = sectionDefs.map((def) => {
        const rows = buildRows(def.types);
        const totals = sumColumns(rows);
        return {
          label: def.label,
          accounts: rows,
          totals,
          total: totals.reduce((s, n) => s + n, 0),
        };
      });
    }

    // Export formats (multi-column statement: one amount column per dimension
    // value, aligned to `columns`).
    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      const statement: Statement = {
        title:
          mode === "pnl"
            ? "Profit and Loss by Tracking Category"
            : "Account Balances by Tracking Category",
        periodLabel: `${startDate} to ${endDate}`,
        currency,
        columns,
        sections: sectionsJson.map((s) => ({
          label: s.label,
          rows: s.accounts.map((a) => ({
            code: a.accountCode,
            name: a.accountName,
            amounts: a.amounts,
            depth: 1,
          })),
          subtotals: s.totals,
        })),
        ...(mode === "pnl" && netByColumn
          ? { grandTotals: netByColumn }
          : {}),
      };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      const dimLabel = dimension === "projectId" ? "project" : "cost-center";
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="tracking-${dimLabel}-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="tracking-${dimLabel}-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      dimension,
      mode,
      basis,
      startDate,
      endDate,
      // Column descriptors, aligned to every `amounts`/`totals` array below.
      // `dimensionValue` is the id to pass to the general-ledger report's
      // ?costCenterId / ?projectId filter (null = unassigned).
      columns: columnKeys.map((key, i) => ({
        key,
        label: columns[i],
        dimensionValue: key === UNASSIGNED_KEY ? null : key,
      })),
      sections: sectionsJson,
      ...(mode === "pnl"
        ? { netIncome: { byColumn: netByColumn, total: netTotal } }
        : {}),
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Resolve dimension-value ids to display labels.
 * Cost centers => "CODE Name"; projects => "Name". Soft-deleted rows are still
 * resolved (historical postings may reference them) but org-scoped.
 */
async function resolveLabels(
  organizationId: string,
  dimension: Dimension,
  ids: string[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (ids.length === 0) return labels;
  const unique = Array.from(new Set(ids));

  if (dimension === "costCenterId") {
    const rows = await db
      .select({
        id: costCenter.id,
        code: costCenter.code,
        name: costCenter.name,
      })
      .from(costCenter)
      .where(eq(costCenter.organizationId, organizationId));
    for (const r of rows) {
      if (unique.includes(r.id)) {
        labels.set(r.id, r.code ? `${r.code} ${r.name}` : r.name);
      }
    }
  } else {
    const rows = await db
      .select({ id: project.id, name: project.name })
      .from(project)
      .where(eq(project.organizationId, organizationId));
    for (const r of rows) {
      if (unique.includes(r.id)) labels.set(r.id, r.name);
    }
  }

  return labels;
}
