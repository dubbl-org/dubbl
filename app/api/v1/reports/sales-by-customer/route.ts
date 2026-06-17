import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, contact, organization } from "@/lib/db/schema";
import { eq, and, isNull, ne, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";

/**
 * Sales by Customer.
 *
 * Aggregates posted/issued invoice lines by customer (contact) over a date
 * range, returning net sales (pre-tax line amount), tax, gross, and invoice
 * count per customer. Amounts are integer cents.
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
        contactId: invoice.contactId,
        contactName: contact.name,
        net: sql<number>`coalesce(sum(${invoiceLine.amount}), 0)`,
        tax: sql<number>`coalesce(sum(${invoiceLine.taxAmount}), 0)`,
        invoiceCount: sql<number>`count(distinct ${invoice.id})`,
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .leftJoin(contact, eq(invoice.contactId, contact.id))
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
      .groupBy(invoice.contactId, contact.name)
      .orderBy(sql`coalesce(sum(${invoiceLine.amount}), 0) desc`);

    const customers = rows.map((r) => {
      const net = Number(r.net);
      const tax = Number(r.tax);
      return {
        contactId: r.contactId,
        contactName: r.contactName || "Unknown",
        net,
        tax,
        gross: net + tax,
        invoiceCount: Number(r.invoiceCount),
      };
    });

    const totals = customers.reduce(
      (acc, c) => {
        acc.net += c.net;
        acc.tax += c.tax;
        acc.gross += c.gross;
        acc.invoiceCount += c.invoiceCount;
        return acc;
      },
      { net: 0, tax: 0, gross: 0, invoiceCount: 0 }
    );

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";

      const statement: Statement = {
        title: "Sales by Customer",
        periodLabel: `${startDate} to ${endDate}`,
        currency,
        columns: ["Net", "Tax", "Gross"],
        sections: [
          {
            label: "Customers",
            rows: customers.map((c) => ({
              name: c.contactName,
              amounts: [c.net, c.tax, c.gross],
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
            "Content-Disposition": `attachment; filename="sales-by-customer-${startDate}-${endDate}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sales-by-customer-${startDate}-${endDate}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      startDate,
      endDate,
      customers,
      totals,
    });
  } catch (err) {
    return handleError(err);
  }
}
