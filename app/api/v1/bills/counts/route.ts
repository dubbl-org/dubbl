import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const rows = await db
      .select({
        status: bill.status,
        count: count(),
        amount: sql<number>`coalesce(sum(${bill.amountDue}), 0)`.mapWith(Number),
      })
      .from(bill)
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notDeleted(bill.deletedAt)
        )
      )
      .groupBy(bill.status);

    const counts: Record<string, { count: number; amount: number }> = {};
    let total = 0;
    for (const row of rows) {
      counts[row.status] = { count: row.count, amount: row.amount };
      total += row.count;
    }

    return NextResponse.json({ counts, total });
  } catch (err) {
    return handleError(err);
  }
}
