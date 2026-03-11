import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reminderLog } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [eq(reminderLog.organizationId, ctx.organizationId)];

    const status = url.searchParams.get("status");
    if (status && ["sent", "failed", "skipped"].includes(status)) {
      conditions.push(eq(reminderLog.status, status as "sent" | "failed" | "skipped"));
    }

    const logs = await db.query.reminderLog.findMany({
      where: and(...conditions),
      orderBy: desc(reminderLog.sentAt),
      limit,
      offset,
      with: { reminderRule: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(reminderLog)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(logs, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}
