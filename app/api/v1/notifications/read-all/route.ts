import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, handleError } from "@/lib/api/response";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.organizationId, ctx.organizationId),
          eq(notification.userId, ctx.userId),
          isNull(notification.readAt),
          notDeleted(notification.deletedAt)
        )
      );

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
