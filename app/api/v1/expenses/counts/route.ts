import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim } from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const rows = await db
      .select({
        status: expenseClaim.status,
        count: count(),
        amount: sql<number>`coalesce(sum(${expenseClaim.totalAmount}), 0)`.mapWith(Number),
      })
      .from(expenseClaim)
      .where(
        and(
          eq(expenseClaim.organizationId, ctx.organizationId),
          notDeleted(expenseClaim.deletedAt)
        )
      )
      .groupBy(expenseClaim.status);

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
