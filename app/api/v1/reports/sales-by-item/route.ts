import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, inventoryItem, organization } from "@/lib/db/schema";
import { eq, and, isNull, ne, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";

/**
 * Sales by Item.
 *
 * Aggregates posted/issued invoice lines by inventory item over a date range,
 * returning quantity sold, net sales (pre-tax line amount), tax and gross per
 * item. Lines NOT linked to an inventory item are grouped into an
 * "Uncategorized" bucket (keyed by null). All monetary amounts are integer
 * cents; quantity is the schema's 2-decimal integer (1.00 = 100) summed.
 *
 * Query params:
 *   - startDate, endDate (ISO YYYY-MM-DD; default = current calendar year)
 *   - format = json (default) | pdf | xlsx
 *
 * Only counts invoices that represent real sales: excludes draft and void.
 */
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

    const rows = await db
      .select({
        itemId: invoiceLine.inventoryItemId,
        itemCode: inventoryItem.code,
        itemName: inventoryItem.name,
        quantity: sql<number>`coalesce(sum(${invoiceLine.quantity}), 0)`,
        net: sql<number>`coalesce(sum(${invoiceLine.amount}), 0)`,
        tax: sql<number>`coalesce(sum(${invoiceLine.taxAmount}), 0)`,
        lineCount: sql<number>`count(${invoiceLine.id})`,
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .leftJoin(
        inventoryItem,
        eq(invoiceLine.inventoryItemId, inventoryItem.id)
      )
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          isNull(invoice.deletedAt),
          ne(invoice.status, "void"),
          ne(invoice.status, "draft"),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate)
        )
      )
      .groupBy(invoiceLine.inventoryItemId, inventoryItem.code, inventoryItem.name)
      .orderBy(sql`coalesce(sum(${invoiceLine.amount}), 0) desc`);

    const items = rows.map((r) => {
      const net = Number(r.net);
      const tax = Number(r.tax);
      return {
        itemId: r.itemId,
        itemCode: r.itemCode || null,
        itemName: r.itemId ? r.itemName || "Unknown item" : "Uncategorized",
        quantity: Number(r.quantity),
        net,
        tax,
        gross: net + tax,
        lineCount: Number(r.lineCount),
      };
    });

    const totals = items.reduce(
      (acc, i) => {
        acc.quantity += i.quantity;
        acc.net += i.net;
        acc.tax += i.tax;
        acc.gross += i.gross;
        acc.lineCount += i.lineCount;
        return acc;
      },
      { quantity: 0, net: 0, tax: 0, gross: 0, lineCount: 0 }
    );

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      const statement: Statement = {
        title: "Sales by Item",
        periodLabel: `${startDate} to ${endDate}`,
        currency,
        columns: ["Net", "Tax", "Gross"],
        sections: [
          {
            label: "Items",
            rows: items.map((i) => ({
              code: i.itemCode ?? undefined,
              name: i.itemName,
              amounts: [i.net, i.tax, i.gross],
              depth: 1,
            })),
            subtotals: [totals.net, totals.tax, totals.gross],
          },
        ],
        grandTotals: [totals.net, totals.tax, totals.gross],
      };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="sales-by-item-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sales-by-item-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      startDate,
      endDate,
      items,
      totals,
    });
  } catch (err) {
    return handleError(err);
  }
}
