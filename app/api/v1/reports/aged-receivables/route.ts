import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

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

    return NextResponse.json({ buckets, grandTotal });
  } catch (err) {
    return handleError(err);
  }
}
