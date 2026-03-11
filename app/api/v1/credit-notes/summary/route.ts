import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const base = [
      eq(creditNote.organizationId, ctx.organizationId),
      notDeleted(creditNote.deletedAt),
    ];

    // Totals
    const [totals] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalAmount: sql<number>`coalesce(sum(${creditNote.total}), 0)::int`,
        totalApplied: sql<number>`coalesce(sum(${creditNote.amountApplied}), 0)::int`,
        totalRemaining: sql<number>`coalesce(sum(${creditNote.amountRemaining}), 0)::int`,
      })
      .from(creditNote)
      .where(and(...base));

    // Status breakdown
    const statusRows = await db
      .select({
        status: creditNote.status,
        count: sql<number>`count(*)::int`,
        amount: sql<number>`coalesce(sum(${creditNote.total}), 0)::int`,
      })
      .from(creditNote)
      .where(and(...base))
      .groupBy(creditNote.status);

    const statusBreakdown: Record<string, { count: number; amount: number }> = {
      draft: { count: 0, amount: 0 },
      sent: { count: 0, amount: 0 },
      applied: { count: 0, amount: 0 },
      void: { count: 0, amount: 0 },
    };

    for (const row of statusRows) {
      statusBreakdown[row.status] = { count: row.count, amount: row.amount };
    }

    return NextResponse.json({
      totalCount: totals?.count || 0,
      totalAmount: totals?.totalAmount || 0,
      totalApplied: totals?.totalApplied || 0,
      totalRemaining: totals?.totalRemaining || 0,
      statusBreakdown,
    });
  } catch (err) {
    return handleError(err);
  }
}
