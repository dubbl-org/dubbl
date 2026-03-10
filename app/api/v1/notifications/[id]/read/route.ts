import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, notFound, handleError } from "@/lib/api/response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const [updated] = await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.id, id),
          eq(notification.organizationId, ctx.organizationId),
          eq(notification.userId, ctx.userId)
        )
      )
      .returning();

    if (!updated) return notFound("Notification");
    return ok({ notification: updated });
  } catch (err) {
    return handleError(err);
  }
}
