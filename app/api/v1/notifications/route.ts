import { db } from "@/lib/db";
import { notification, notificationPreference } from "@/lib/db/schema";
import { eq, and, isNull, desc, notInArray } from "drizzle-orm";
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

    // Types the user switched off for the in-app channel stay out of the inbox
    const muted = await db.query.notificationPreference.findMany({
      where: and(
        eq(notificationPreference.organizationId, ctx.organizationId),
        eq(notificationPreference.userId, ctx.userId),
        eq(notificationPreference.channel, "in_app"),
        eq(notificationPreference.enabled, false)
      ),
      columns: { type: true },
    });

    const conditions = [
      eq(notification.organizationId, ctx.organizationId),
      eq(notification.userId, ctx.userId),
      notDeleted(notification.deletedAt),
    ];

    if (muted.length > 0) {
      conditions.push(notInArray(notification.type, muted.map((m) => m.type)));
    }

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
