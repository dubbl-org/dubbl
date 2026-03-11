import { db } from "@/lib/db";
import { portalAccessToken } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, notFound, handleError } from "@/lib/api/response";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const [revoked] = await db
      .update(portalAccessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(portalAccessToken.id, id),
          eq(portalAccessToken.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!revoked) return notFound("Portal access");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
