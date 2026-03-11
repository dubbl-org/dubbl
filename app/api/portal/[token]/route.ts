import { db } from "@/lib/db";
import { portalAccessToken } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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
