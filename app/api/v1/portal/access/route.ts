import { db } from "@/lib/db";
import { portalAccessToken } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const tokens = await db.query.portalAccessToken.findMany({
      where: and(
        eq(portalAccessToken.organizationId, ctx.organizationId),
        isNull(portalAccessToken.revokedAt)
      ),
      with: { contact: true },
      orderBy: portalAccessToken.createdAt,
    });

    return ok({
      data: tokens.map((t) => ({
        id: t.id,
        contactId: t.contactId,
        contactName: t.contact?.name,
        token: t.token,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
