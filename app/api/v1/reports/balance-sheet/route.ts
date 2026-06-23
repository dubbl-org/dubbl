import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { centsToDecimal } from "@/lib/money";
import { aggregateAsAt, type AccountAggregate } from "@/lib/reports/gl-query";
import type { Statement } from "@/lib/reports/statement-export";

type BsType = "asset" | "liability" | "equity";
const BS_TYPES: BsType[] = ["asset", "liability", "equity"];

/** Inclusive YYYY-MM-DD validator. */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/**
 * Collect requested comparison dates from `?compareDate=`. Supports the param
 * repeated (`?compareDate=a&compareDate=b`) and comma-separated values
 * (`?compareDate=a,b`). Order is preserved; duplicates and the primary asAt are
 * dropped. Invalid dates throw a 400 via the caller's try/catch.
 */
function parseCompareDates(url: URL, asAt: string): string[] {
  const raw = url.searchParams
    .getAll("compareDate")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  const seen = new Set<string>([asAt]);
  const out: string[] = [];
  for (const d of raw) {
    if (!isValidDate(d)) {
      throw new Error(`Invalid compareDate: ${d} (expected YYYY-MM-DD)`);
    }
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    // `asAt` is the canonical param; `asOf` is accepted as an alias for
    // backward-compat with existing callers (e.g. the comparative page).
    const asAt =
      url.searchParams.get("asAt") ||
      url.searchParams.get("asOf") ||
      new Date().toISOString().slice(0, 10);
    if (!isValidDate(asAt)) {
      throw new Error(`Invalid asAt: ${asAt} (expected YYYY-MM-DD)`);
    }
    const compareDates = parseCompareDates(url, asAt);

    // All the dates we need a balance for: primary first, then comparatives.
    const allDates = [asAt, ...compareDates];

    // Cumulative balances as at each requested date. Aggregations are
    // org-scoped and posted-only via gl-query.
    const perDate = await Promise.all(
      allDates.map((date) =>
        aggregateAsAt(ctx.organizationId, date, {
          accountTypes: BS_TYPES,
          includeEmptyAccounts: true,
        })
      )
    );

    // Current-year (un-closed) earnings as at each date: revenue − expenses
    // that haven't been closed to retained earnings yet. Without this the sheet
    // is off by year-to-date profit for any date inside the open year and does
    // NOT balance — the whole point of a balance sheet.
    const plPerDate = await Promise.all(
      allDates.map((date) =>
        aggregateAsAt(ctx.organizationId, date, {
          accountTypes: ["revenue", "expense"],
        })
      )
    );
    const earningsByDate = plPerDate.map((accts) =>
      accts.reduce(
        (s, a) => s + (a.type === "revenue" ? a.balance : -a.balance),
        0
      )
    );

    // Index each date's aggregates by accountId for O(1) lookup. The
    // includeEmptyAccounts path returns the same account set per date, but we
    // index defensively so a missing account simply reads as a zero balance.
    const byDate = perDate.map((accounts) => {
      const m = new Map<string, AccountAggregate>();
      for (const a of accounts) m.set(a.accountId, a);
      return m;
    });

    // Master account list (codes/names/types) taken from the primary date's
    // aggregation, which lists every account (includeEmptyAccounts: true).
    const primary = perDate[0];

    interface BsAccount {
      accountId: string;
      code: string;
      name: string;
      /** balanceCents per requested date, aligned to allDates. */
      balances: number[];
    }

    function buildSection(type: BsType): {
      type: BsType;
      accounts: BsAccount[];
      totals: number[];
    } {
      const accountsOfType = primary.filter((a) => a.type === type);
      const accounts: BsAccount[] = accountsOfType.map((a) => ({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        balances: byDate.map((m) => m.get(a.accountId)?.balance ?? 0),
      }));
      const totals = allDates.map((_, i) =>
        accounts.reduce((s, acc) => s + acc.balances[i], 0)
      );
      return { type, accounts, totals };
    }

    const assets = buildSection("asset");
    const liabilities = buildSection("liability");
    const equity = buildSection("equity");
    // Carry current-year earnings into equity so Assets = Liabilities + Equity.
    if (earningsByDate.some((v) => v !== 0)) {
      equity.accounts.push({
        accountId: "current-year-earnings",
        code: "",
        name: "Current Year Earnings",
        balances: earningsByDate,
      });
      equity.totals = equity.totals.map((t, i) => t + earningsByDate[i]);
    }
    const sections = [assets, liabilities, equity];

    const hasComparatives = compareDates.length > 0;
    const labelFor = (t: BsType) =>
      t === "asset" ? "Assets" : t === "liability" ? "Liabilities" : "Equity";

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      const statement: Statement = hasComparatives
        ? {
            title: "Balance Sheet",
            periodLabel: `As at ${asAt}`,
            currency,
            columns: allDates.map((d) => `As at ${d}`),
            sections: sections.map((sec) => ({
              label: labelFor(sec.type),
              rows: sec.accounts.map((a) => ({
                code: a.code,
                name: a.name,
                amounts: a.balances,
                depth: 1,
              })),
              subtotals: sec.totals,
            })),
          }
        : {
            title: "Balance Sheet",
            periodLabel: `As at ${asAt}`,
            currency,
            sections: sections.map((sec) => ({
              label: labelFor(sec.type),
              rows: sec.accounts.map((a) => ({
                code: a.code,
                name: a.name,
                amount: a.balances[0],
                depth: 1,
              })),
              subtotal: sec.totals[0],
            })),
          };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="balance-sheet-${asAt}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="balance-sheet-${asAt}.xlsx"`,
        },
      });
    }

    // JSON: keep the original single-value `balance`/`total` (the primary asAt
    // date) so existing callers are unchanged; ADD `accountId` for drill-down
    // and, when comparatives are requested, per-date `balances`/`totals`.
    const toJson = (sec: ReturnType<typeof buildSection>) => ({
      type: sec.type,
      accounts: sec.accounts.map((a) => ({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        balance: centsToDecimal(a.balances[0]),
        ...(hasComparatives
          ? { balances: a.balances.map((b) => centsToDecimal(b)) }
          : {}),
      })),
      total: centsToDecimal(sec.totals[0]),
      ...(hasComparatives
        ? { totals: sec.totals.map((t) => centsToDecimal(t)) }
        : {}),
    });

    return NextResponse.json({
      asAt,
      ...(hasComparatives ? { dates: allDates, compareDates } : {}),
      assets: toJson(assets),
      liabilities: toJson(liabilities),
      equity: toJson(equity),
    });
  } catch (err) {
    return handleError(err);
  }
}
