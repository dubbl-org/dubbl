import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, organization, payment, paymentAllocation } from "@/lib/db/schema";
import { eq, and, isNull, ne, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import type { Statement } from "@/lib/reports/statement-export";

/** Inclusive YYYY-MM-DD validator. */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

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

    // Optional `asAt` (YYYY-MM-DD). When present the report is computed as a
    // historical snapshot at that date: aging buckets/daysOverdue are measured
    // from `asAt`, and each invoice's open balance excludes payments dated
    // after `asAt` (and excludes invoices issued after `asAt`). Defaults to now.
    const asAtParam = url.searchParams.get("asAt");
    if (asAtParam && !isValidDate(asAtParam)) {
      throw new Error(`Invalid asAt: ${asAtParam} (expected YYYY-MM-DD)`);
    }
    const isHistorical = Boolean(asAtParam);
    const today = asAtParam ? new Date(`${asAtParam}T00:00:00Z`) : new Date();
    const asAtStr = asAtParam ?? today.toISOString().slice(0, 10);

    // For a historical snapshot we must also consider invoices now marked
    // "paid" — they may still have been open as at the chosen date — and then
    // reconstruct each invoice's open balance from its payment allocations
    // dated on or before `asAt`.
    const invoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        isNull(invoice.deletedAt),
        ne(invoice.status, "void"),
        ...(isHistorical ? [] : [ne(invoice.status, "paid")]),
        ne(invoice.status, "draft")
      ),
      with: { contact: true },
    });

    // open balance as at `asAt`, keyed by invoice id (historical mode only).
    const openByInvoice = new Map<string, number>();
    if (isHistorical && invoices.length > 0) {
      for (const inv of invoices) openByInvoice.set(inv.id, inv.total);
      const allocations = await db
        .select({
          documentId: paymentAllocation.documentId,
          amount: paymentAllocation.amount,
          paymentDate: payment.date,
        })
        .from(paymentAllocation)
        .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
        .where(
          and(
            eq(paymentAllocation.documentType, "invoice"),
            inArray(
              paymentAllocation.documentId,
              invoices.map((i) => i.id)
            ),
            isNull(payment.deletedAt)
          )
        );
      for (const a of allocations) {
        // Only payments dated on or before asAt reduce the historical balance.
        // (payment.date is a YYYY-MM-DD string, so a string compare is safe.)
        if (a.paymentDate > asAtStr) continue;
        openByInvoice.set(
          a.documentId,
          (openByInvoice.get(a.documentId) ?? 0) - a.amount
        );
      }
    }
    const buckets: AgingBucket[] = [
      { label: "Current", total: 0, count: 0, invoices: [] },
      { label: "1-30 days", total: 0, count: 0, invoices: [] },
      { label: "31-60 days", total: 0, count: 0, invoices: [] },
      { label: "61-90 days", total: 0, count: 0, invoices: [] },
      { label: "90+ days", total: 0, count: 0, invoices: [] },
    ];

    for (const inv of invoices) {
      // In historical mode, skip invoices not yet issued as at the date and
      // use the reconstructed open balance; otherwise use the stored snapshot.
      if (isHistorical && inv.issueDate > asAtStr) continue;
      const amountDue = isHistorical
        ? openByInvoice.get(inv.id) ?? inv.amountDue
        : inv.amountDue;
      if (isHistorical && amountDue <= 0) continue;

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
        amountDue,
        daysOverdue: Math.max(0, daysOverdue),
      };

      buckets[bucketIdx].invoices.push(entry);
      buckets[bucketIdx].total += amountDue;
      buckets[bucketIdx].count += 1;
    }

    const grandTotal = buckets.reduce((sum, b) => sum + b.total, 0);

    if (format === "pdf" || format === "xlsx") {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultCurrency: true },
      });
      const currency = org?.defaultCurrency || "USD";
      const asAt = asAtStr;

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

    return NextResponse.json({ asAt: asAtStr, buckets, grandTotal });
  } catch (err) {
    return handleError(err);
  }
}
