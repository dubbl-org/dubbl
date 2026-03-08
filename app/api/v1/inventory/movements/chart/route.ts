import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryMovement } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

function dateTrunc(period: string) {
  // Use date_trunc for grouping - safe against SQL injection since values are hardcoded
  switch (period) {
    case "90d":
      return sql`date_trunc('week', ${inventoryMovement.createdAt})::date`;
    case "12m":
      return sql`date_trunc('month', ${inventoryMovement.createdAt})::date`;
    default:
      return sql`date_trunc('day', ${inventoryMovement.createdAt})::date`;
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "30d";
    const warehouseId = url.searchParams.get("warehouseId");

    const days = period === "12m" ? 365 : period === "90d" ? 90 : 30;
    const groupBy = period === "12m" ? "month" : period === "90d" ? "week" : "day";

    const since = new Date();
    since.setDate(since.getDate() - days);

    const conditions = [
      eq(inventoryMovement.organizationId, ctx.organizationId),
      gte(inventoryMovement.createdAt, since),
    ];

    if (warehouseId) {
      conditions.push(eq(inventoryMovement.warehouseId, warehouseId));
    }

    const bucket = dateTrunc(period);

    const rows = await db
      .select({
        date: sql<string>`${bucket}`,
        inQty: sql<number>`coalesce(sum(case when ${inventoryMovement.quantity} > 0 then ${inventoryMovement.quantity} else 0 end), 0)::int`,
        outQty: sql<number>`coalesce(sum(case when ${inventoryMovement.quantity} < 0 then abs(${inventoryMovement.quantity}) else 0 end), 0)::int`,
        net: sql<number>`coalesce(sum(${inventoryMovement.quantity}), 0)::int`,
      })
      .from(inventoryMovement)
      .where(and(...conditions))
      .groupBy(bucket)
      .orderBy(bucket);

    return NextResponse.json({
      data: rows.map((r) => ({
        date: r.date,
        in: Number(r.inQty),
        out: Number(r.outQty),
        net: Number(r.net),
      })),
      period,
      groupBy,
    });
  } catch (err) {
    return handleError(err);
  }
}
