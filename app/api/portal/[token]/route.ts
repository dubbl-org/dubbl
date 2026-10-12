import { db } from "@/lib/db";
import { portalAccessToken, portalActivityLog } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { ok, notFound, error, handleError } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const access = await db.query.portalAccessToken.findFirst({
      where: and(
        eq(portalAccessToken.token, token),
        isNull(portalAccessToken.revokedAt)
      ),
      with: { contact: true, organization: true },
    });

    if (!access) return notFound("Portal access");
    if (access.expiresAt && access.expiresAt < new Date()) {
      return error("Portal link has expired", 410);
    }

    // Record that the customer opened their portal, at most once per 10 minutes
    // (the layout and the overview page both load this on a single visit).
    const recent = await db.query.portalActivityLog.findFirst({
      where: and(
        eq(portalActivityLog.tokenId, access.id),
        eq(portalActivityLog.action, "view_portal"),
        gt(portalActivityLog.createdAt, new Date(Date.now() - 10 * 60 * 1000))
      ),
    });
    if (!recent) {
      await db.insert(portalActivityLog).values({
        tokenId: access.id,
        action: "view_portal",
        ipAddress: request.headers.get("x-forwarded-for") || null,
      });
    }

    return ok({
      contact: {
        id: access.contact.id,
        name: access.contact.name,
        email: access.contact.email,
      },
      organization: {
        name: access.organization.name,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
