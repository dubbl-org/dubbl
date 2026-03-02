import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

interface AgingBucket {
  label: string;
  total: number;
  count: number;
  bills: {
    id: string;
    billNumber: string;
    contactName: string;
    dueDate: string;
    amountDue: number;
    daysOverdue: number;
  }[];
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const bills = await db.query.bill.findMany({
      where: and(
        eq(bill.organizationId, ctx.organizationId),
        isNull(bill.deletedAt),
        ne(bill.status, "void"),
        ne(bill.status, "paid"),
        ne(bill.status, "draft")
      ),
      with: { contact: true },
    });

    const today = new Date();
    const buckets: AgingBucket[] = [
      { label: "Current", total: 0, count: 0, bills: [] },
      { label: "1-30 days", total: 0, count: 0, bills: [] },
      { label: "31-60 days", total: 0, count: 0, bills: [] },
      { label: "61-90 days", total: 0, count: 0, bills: [] },
      { label: "90+ days", total: 0, count: 0, bills: [] },
    ];

    for (const b of bills) {
      const due = new Date(b.dueDate);
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
        id: b.id,
        billNumber: b.billNumber,
        contactName: b.contact?.name || "Unknown",
        dueDate: b.dueDate,
        amountDue: b.amountDue,
        daysOverdue: Math.max(0, daysOverdue),
      };

      buckets[bucketIdx].bills.push(entry);
      buckets[bucketIdx].total += b.amountDue;
      buckets[bucketIdx].count += 1;
    }

    const grandTotal = buckets.reduce((sum, bkt) => sum + bkt.total, 0);

    return NextResponse.json({ buckets, grandTotal });
  } catch (err) {
    return handleError(err);
  }
}
