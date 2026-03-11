import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, quote } from "@/lib/db/schema";
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
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Quote not found or not in sent status" }, { status: 404 });
    }

    const [updated] = await db
      .update(quote)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(quote.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
