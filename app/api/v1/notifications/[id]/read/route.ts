import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";

async function setRead(request: Request, params: Promise<{ id: string }>, read: boolean) {
  const { id } = await params;
  const ctx = await getAuthContext(request);

  const [updated] = await db
    .update(notification)
    .set({ readAt: read ? new Date() : null })
    .where(
      and(
        eq(notification.id, id),
        eq(notification.organizationId, ctx.organizationId),
        eq(notification.userId, ctx.userId),
        notDeleted(notification.deletedAt)
      )
    )
    .returning();

  if (!updated) return notFound("Notification");
  return ok({ notification: updated });
}

/** Mark a notification as read. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await setRead(request, params, true);
  } catch (err) {
    return handleError(err);
  }
}

/** Mark a notification as unread again. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await setRead(request, params, false);
  } catch (err) {
    return handleError(err);
  }
}
