import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { queryAuditLog } from "@/lib/api/audit-log-query";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:audit-log");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const result = await queryAuditLog(
      ctx.organizationId,
      {
        entityType: url.searchParams.get("entityType"),
        entityId: url.searchParams.get("entityId"),
        userId: url.searchParams.get("userId"),
        action: url.searchParams.get("action"),
        startDate: url.searchParams.get("startDate"),
        endDate: url.searchParams.get("endDate"),
        search: url.searchParams.get("search"),
      },
      { limit, offset }
    );

    return NextResponse.json({
      ...paginatedResponse(result.data, result.total, page, limit),
      actionCounts: result.actionCounts,
      allTotal: result.allTotal,
    });
  } catch (err) {
    return handleError(err);
  }
}
