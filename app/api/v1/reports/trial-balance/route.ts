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
    // backward-compat with existing callers.
    const asAt =
      url.searchParams.get("asAt") ||
      url.searchParams.get("asOf") ||
      new Date().toISOString().slice(0, 10);
    if (!isValidDate(asAt)) {
      throw new Error(`Invalid asAt: ${asAt} (expected YYYY-MM-DD)`);
    }
    const compareDates = parseCompareDates(url, asAt);
    const allDates = [asAt, ...compareDates];
    const hasComparatives = compareDates.length > 0;

    // Cumulative balances as at each requested date, every account listed.
    const perDate = await Promise.all(
      allDates.map((date) =>
        aggregateAsAt(ctx.organizationId, date, { includeEmptyAccounts: true })
      )
    );

    const byDate = perDate.map((accounts) => {
      const m = new Map<string, AccountAggregate>();
      for (const a of accounts) m.set(a.accountId, a);
      return m;
    });

    // Master account list from the primary date (includeEmptyAccounts lists all).
    const primary = perDate[0];

    const result = primary.map((a) => {
      // `balance` from gl-query is natural-signed; positive = on its normal
      // side (debit for asset/expense, credit for liability/equity/revenue).
      const balances = byDate.map((m) => m.get(a.accountId)?.balance ?? 0);
      return {
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        type: a.type,
        balances,
      };
    });

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";
      const totals = allDates.map((_, i) =>
        result.reduce((s, r) => s + r.balances[i], 0)
      );

      const statement: Statement = hasComparatives
        ? {
            title: "Trial Balance",
            periodLabel: `As at ${asAt}`,
            currency,
            columns: allDates.map((d) => `As at ${d}`),
            sections: [
              {
                label: "Accounts",
                rows: result.map((r) => ({
                  code: r.code,
                  name: r.name,
                  amounts: r.balances,
                  depth: 0,
                })),
                subtotals: totals,
              },
            ],
          }
        : {
            title: "Trial Balance",
            periodLabel: `As at ${asAt}`,
            currency,
            sections: [
              {
                label: "Accounts",
                rows: result.map((r) => ({
                  code: r.code,
                  name: r.name,
                  amount: r.balances[0],
                  depth: 0,
                })),
                subtotal: totals[0],
              },
            ],
          };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="trial-balance-${asAt}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="trial-balance-${asAt}.xlsx"`,
        },
      });
    }

    // JSON: split the (primary-date) natural balance into debit/credit columns
    // exactly as before; ADD `accountId` (already present) and `asAt`, plus a
    // per-date `balances` array (debit/credit per requested date) when
    // comparatives are requested.
    const splitDebitCredit = (cents: number) => ({
      debitBalance: cents > 0 ? centsToDecimal(cents) : "0.00",
      creditBalance: cents < 0 ? centsToDecimal(Math.abs(cents)) : "0.00",
      balance: centsToDecimal(cents),
    });

    return NextResponse.json({
      asAt,
      ...(hasComparatives ? { dates: allDates, compareDates } : {}),
      accounts: result.map((r) => ({
        accountId: r.accountId,
        code: r.code,
        name: r.name,
        type: r.type,
        ...splitDebitCredit(r.balances[0]),
        ...(hasComparatives
          ? { balances: r.balances.map((b) => splitDebitCredit(b)) }
          : {}),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
