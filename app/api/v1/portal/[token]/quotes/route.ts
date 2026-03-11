import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, quote } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

async function validateToken(token: string) {
  const access = await db.query.portalAccessToken.findFirst({
    where: and(
      eq(portalAccessToken.token, token),
      isNull(portalAccessToken.revokedAt)
    ),
    with: { contact: true, organization: true },
  });
  if (!access) return null;
  if (access.expiresAt && access.expiresAt < new Date()) return null;
  return access;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const access = await validateToken(token);
    if (!access) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const quotes = await db.query.quote.findMany({
      where: and(
        eq(quote.organizationId, access.organizationId),
        eq(quote.contactId, access.contactId),
        isNull(quote.deletedAt)
      ),
      orderBy: desc(quote.issueDate),
      with: { lines: true },
    });

    return NextResponse.json({ data: quotes });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
