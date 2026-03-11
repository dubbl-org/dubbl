import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const base = [
      eq(recurringTemplate.organizationId, ctx.organizationId),
      notDeleted(recurringTemplate.deletedAt),
    ];

    // Total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringTemplate)
      .where(and(...base));

    // Active count
    const [activeResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringTemplate)
      .where(and(...base, eq(recurringTemplate.status, "active")));

    // Paused count
    const [pausedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringTemplate)
      .where(and(...base, eq(recurringTemplate.status, "paused")));

    // Completed count
    const [completedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringTemplate)
      .where(and(...base, eq(recurringTemplate.status, "completed")));

    // Total generated
    const [generatedResult] = await db
      .select({
        total: sql<number>`coalesce(sum(${recurringTemplate.occurrencesGenerated}), 0)::int`,
      })
      .from(recurringTemplate)
      .where(and(...base));

    return NextResponse.json({
      totalCount: countResult?.count || 0,
      activeCount: activeResult?.count || 0,
      pausedCount: pausedResult?.count || 0,
      completedCount: completedResult?.count || 0,
      totalGenerated: generatedResult?.total || 0,
    });
  } catch (err) {
    return handleError(err);
  }
}
