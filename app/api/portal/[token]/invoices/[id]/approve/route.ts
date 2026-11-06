import { db } from "@/lib/db";
import { portalAccessToken, quote, portalActivityLog } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { ok, notFound, error, handleError } from "@/lib/api/response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  try {
    const { token, id } = await params;

    const access = await db.query.portalAccessToken.findFirst({
      where: and(
        eq(portalAccessToken.token, token),
        isNull(portalAccessToken.revokedAt)
      ),
    });

    if (!access) return notFound("Portal access");
    if (access.expiresAt && access.expiresAt < new Date()) {
      return error("Portal link has expired", 410);
    }

    const q = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, access.organizationId),
        eq(quote.contactId, access.contactId),
        isNull(quote.deletedAt)
      ),
    });

    if (!q) return notFound("Quote");
    // Same rules as /api/v1/portal/[token]/quotes/[id]/accept: only a sent,
    // unexpired quote can be accepted (never a draft, declined or converted one).
    if (q.status !== "sent") return error("Only sent quotes can be accepted", 400);
    if (q.expiryDate < new Date().toISOString().split("T")[0]) {
      return error("This quote has expired", 400);
    }

    const [updated] = await db
      .update(quote)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(quote.id, id))
      .returning();

    await db.insert(portalActivityLog).values({
      tokenId: access.id,
      action: "approve_quote",
      entityType: "quote",
      entityId: id,
      ipAddress: request.headers.get("x-forwarded-for") || null,
    });

    return ok({ quote: { id: updated.id, status: updated.status } });
  } catch (err) {
    return handleError(err);
  }
}
