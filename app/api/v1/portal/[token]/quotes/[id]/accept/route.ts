import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, quote, portalActivityLog } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

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
    if (!access || (access.expiresAt && access.expiresAt < new Date())) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const existing = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, access.organizationId),
        eq(quote.contactId, access.contactId),
        eq(quote.status, "sent"),
        isNull(quote.deletedAt),
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Quote not found or not in sent status" }, { status: 404 });
    }

    const today = new Date().toISOString().split("T")[0];
    if (existing.expiryDate < today) {
      return NextResponse.json({ error: "This quote has expired" }, { status: 400 });
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

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
