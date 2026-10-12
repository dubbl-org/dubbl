import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";

/** Remove a notification from the inbox (soft delete). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const [deleted] = await db
      .update(notification)
      .set(softDelete())
      .where(
        and(
          eq(notification.id, id),
          eq(notification.organizationId, ctx.organizationId),
          eq(notification.userId, ctx.userId),
          notDeleted(notification.deletedAt)
        )
      )
      .returning({ id: notification.id });

    if (!deleted) return notFound("Notification");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
