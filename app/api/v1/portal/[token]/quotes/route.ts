import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, quote } from "@/lib/db/schema";
import { eq, and, isNull, desc, notInArray } from "drizzle-orm";
import { PORTAL_HIDDEN_QUOTE_STATUSES } from "@/lib/api/portal-access";

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
        // Draft quotes haven't been sent to the customer yet.
        notInArray(quote.status, [...PORTAL_HIDDEN_QUOTE_STATUSES]),
        isNull(quote.deletedAt)
      ),
      orderBy: desc(quote.issueDate),
      with: { lines: true },
    });

    // Only customer-facing fields (no internal notes, accounts or cost centers).
    return NextResponse.json({
      data: quotes.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        issueDate: q.issueDate,
        expiryDate: q.expiryDate,
        status: q.status,
        reference: q.reference,
        subtotal: q.subtotal,
        taxTotal: q.taxTotal,
        total: q.total,
        currencyCode: q.currencyCode,
        lines: q.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          taxAmount: l.taxAmount,
          amount: l.amount,
        })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
