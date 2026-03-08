import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const base = [
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt),
    ];

    // Total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoice)
      .where(and(...base));

    // Outstanding (sent + partial + overdue)
    const [outstandingResult] = await db
      .select({
        total: sql<number>`coalesce(sum(${invoice.amountDue}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(invoice)
      .where(
        and(
          ...base,
          inArray(invoice.status, ["sent", "partial", "overdue"]),
        )
      );

    // Overdue only
    const [overdueResult] = await db
      .select({
        total: sql<number>`coalesce(sum(${invoice.amountDue}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(invoice)
      .where(and(...base, eq(invoice.status, "overdue")));

    // Aging buckets
    const agingRows = await db
      .select({
        dueDate: invoice.dueDate,
        amountDue: invoice.amountDue,
      })
      .from(invoice)
      .where(
        and(
          ...base,
          inArray(invoice.status, ["sent", "partial", "overdue"]),
          sql`${invoice.amountDue} > 0`,
        )
      );

    const now = new Date();
    const aging = {
      current: { count: 0, amount: 0 },
      "1-30": { count: 0, amount: 0 },
      "31-60": { count: 0, amount: 0 },
      "60+": { count: 0, amount: 0 },
    };

    for (const row of agingRows) {
      const due = new Date(row.dueDate);
      const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
      if (days <= 0) { aging.current.count++; aging.current.amount += row.amountDue; }
      else if (days <= 30) { aging["1-30"].count++; aging["1-30"].amount += row.amountDue; }
      else if (days <= 60) { aging["31-60"].count++; aging["31-60"].amount += row.amountDue; }
      else { aging["60+"].count++; aging["60+"].amount += row.amountDue; }
    }

    return NextResponse.json({
      totalCount: countResult?.count || 0,
      outstanding: outstandingResult?.total || 0,
      outstandingCount: outstandingResult?.count || 0,
      overdue: overdueResult?.total || 0,
      overdueCount: overdueResult?.count || 0,
      aging,
    });
  } catch (err) {
    return handleError(err);
  }
}
