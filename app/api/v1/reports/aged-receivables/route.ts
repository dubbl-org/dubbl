import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, organization } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";

interface AgingBucket {
  label: string;
  total: number;
  count: number;
  invoices: {
    id: string;
    invoiceNumber: string;
    contactName: string;
    dueDate: string;
    amountDue: number;
    daysOverdue: number;
  }[];
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    const invoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        isNull(invoice.deletedAt),
        ne(invoice.status, "void"),
        ne(invoice.status, "paid"),
        ne(invoice.status, "draft")
      ),
      with: { contact: true },
    });

    const today = new Date();
    const buckets: AgingBucket[] = [
      { label: "Current", total: 0, count: 0, invoices: [] },
      { label: "1-30 days", total: 0, count: 0, invoices: [] },
      { label: "31-60 days", total: 0, count: 0, invoices: [] },
      { label: "61-90 days", total: 0, count: 0, invoices: [] },
      { label: "90+ days", total: 0, count: 0, invoices: [] },
    ];

    for (const inv of invoices) {
      const due = new Date(inv.dueDate);
      const daysOverdue = Math.floor(
        (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
      );

      let bucketIdx: number;
      if (daysOverdue <= 0) bucketIdx = 0;
      else if (daysOverdue <= 30) bucketIdx = 1;
      else if (daysOverdue <= 60) bucketIdx = 2;
      else if (daysOverdue <= 90) bucketIdx = 3;
      else bucketIdx = 4;

      const entry = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contactName: inv.contact?.name || "Unknown",
        dueDate: inv.dueDate,
        amountDue: inv.amountDue,
        daysOverdue: Math.max(0, daysOverdue),
      };

      buckets[bucketIdx].invoices.push(entry);
      buckets[bucketIdx].total += inv.amountDue;
      buckets[bucketIdx].count += 1;
    }

    const grandTotal = buckets.reduce((sum, b) => sum + b.total, 0);

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";
      const asAt = new Date().toISOString().slice(0, 10);

      const statement: Statement = {
        title: "Aged Receivables",
        periodLabel: `As at ${asAt}`,
        currency,
        sections: buckets.map((b) => ({
          label: b.label,
          rows: b.invoices.map((inv) => ({
            code: inv.invoiceNumber,
            name: inv.contactName,
            amount: inv.amountDue,
            depth: 1,
          })),
          subtotal: b.total,
        })),
        grandTotal,
      };

      const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
      if (format === "pdf") {
        const buffer = await toPdf(statement);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="aged-receivables-${asAt}.pdf"`,
          },
        });
      }
      const buffer = await toXlsx(statement);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="aged-receivables-${asAt}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ buckets, grandTotal });
  } catch (err) {
    return handleError(err);
  }
}
