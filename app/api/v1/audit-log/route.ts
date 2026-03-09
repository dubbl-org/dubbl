import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:audit-log");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    const userId = url.searchParams.get("userId");
    const action = url.searchParams.get("action");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const conditions = [eq(auditLog.organizationId, ctx.organizationId)];

    if (entityType) {
      conditions.push(eq(auditLog.entityType, entityType));
    }
    if (entityId) {
      conditions.push(eq(auditLog.entityId, entityId));
    }
    if (userId) {
      conditions.push(eq(auditLog.userId, userId));
    }
    if (action) {
      conditions.push(eq(auditLog.action, action));
    }
    if (startDate) {
      conditions.push(gte(auditLog.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(auditLog.createdAt, new Date(endDate)));
    }

    const entries = await db.query.auditLog.findMany({
      where: and(...conditions),
      orderBy: desc(auditLog.createdAt),
      limit,
      offset,
      with: {
        user: true,
      },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(auditLog)
      .where(and(...conditions));

    const data = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: entry.changes,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      createdAt: entry.createdAt,
      userName: entry.user?.name || entry.user?.email || "Unknown",
    }));

    return NextResponse.json(
      paginatedResponse(data, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}
