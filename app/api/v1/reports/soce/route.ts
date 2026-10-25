/**
 * Statement of changes in equity (SFRS 1), for a period.
 *
 * Query params:
 *   startDate=YYYY-MM-DD  (default: 1 January of the current year)
 *   endDate=YYYY-MM-DD    (default: today)
 *   format=json|xlsx|pdf  (default: json)
 *
 * JSON columns are share capital, retained earnings and their total, in integer
 * minor units (cents). See `lib/reports/soce.ts` for how opening and closing
 * equity are read from the ledger, and why a residual "Dividends and other
 * movements" row appears when equity moved outside profit.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { buildSoceReport } from "@/lib/reports/soce";
import type { Statement } from "@/lib/reports/statement-export";

/** Inclusive YYYY-MM-DD validator. */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
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
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      throw new Error("startDate and endDate must be YYYY-MM-DD");
    }

    const report = await buildSoceReport(ctx.organizationId, startDate, endDate);

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      const statement: Statement = {
        title: "Statement of Changes in Equity",
        periodLabel: `${startDate} to ${endDate}`,
        currency,
        columns: ["Share capital", "Retained earnings", "Total"],
        sections: [
          {
            label: "Changes in equity",
            rows: report.rows.map((r) => ({
              name: r.caption,
              amounts: [r.shareCapital, r.retainedEarnings, r.total],
              depth: 1,
              bold: r.caption.startsWith("Balance at end"),
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
            "Content-Disposition": `attachment; filename="soce-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="soce-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      startDate,
      endDate,
      presentation: "sfrs",
      columns: ["shareCapital", "retainedEarnings", "total"],
      rows: report.rows,
      closing: report.closing,
      netProfit: report.netProfit,
      imbalance: report.imbalance,
    });
  } catch (err) {
    return handleError(err);
  }
}
