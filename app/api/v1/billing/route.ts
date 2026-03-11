import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscription, document } from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const [sub, storageResult] = await Promise.all([
      db.query.subscription.findFirst({
        where: eq(subscription.organizationId, ctx.organizationId),
      }),
      db
        .select({ totalBytes: sql<number>`coalesce(sum(${document.fileSize}), 0)` })
        .from(document)
        .where(
          and(
            eq(document.organizationId, ctx.organizationId),
            isNull(document.deletedAt)
          )
        ),
    ]);

    const storageUsedBytes = Number(storageResult[0]?.totalBytes ?? 0);

    return NextResponse.json({
      billing: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            seatCount: sub.seatCount,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            storageUsedBytes,
          }
        : {
            plan: "free",
            status: "active",
            seatCount: 1,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            storageUsedBytes,
          },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
