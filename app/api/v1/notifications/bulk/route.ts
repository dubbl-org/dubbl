import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, handleError } from "@/lib/api/response";

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["read", "unread", "delete"]),
});

/** Mark several notifications read or unread, or remove them, in one request. */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const { ids, action } = bulkSchema.parse(await request.json());

    const set =
      action === "delete"
        ? softDelete()
        : { readAt: action === "read" ? new Date() : null };

    const updated = await db
      .update(notification)
      .set(set)
      .where(
        and(
          inArray(notification.id, ids),
          eq(notification.organizationId, ctx.organizationId),
          eq(notification.userId, ctx.userId),
          notDeleted(notification.deletedAt)
        )
      )
      .returning({ id: notification.id });

    return ok({ updated: updated.length });
  } catch (err) {
    return handleError(err);
  }
}
