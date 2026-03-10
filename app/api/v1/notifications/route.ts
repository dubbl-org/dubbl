import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const unreadOnly = url.searchParams.get("unread") === "true";

    const conditions = [
      eq(notification.organizationId, ctx.organizationId),
      eq(notification.userId, ctx.userId),
      notDeleted(notification.deletedAt),
    ];

    if (unreadOnly) {
      conditions.push(isNull(notification.readAt));
    }

    const all = await db.query.notification.findMany({
      where: and(...conditions),
      orderBy: desc(notification.createdAt),
    });

    const total = all.length;
    const data = all.slice(offset, offset + limit);

    const unreadCount = unreadOnly
      ? total
      : all.filter((n) => !n.readAt).length;

    return ok({
      ...paginatedResponse(data, total, page, limit),
      unreadCount,
    });
  } catch (err) {
    return handleError(err);
  }
}
