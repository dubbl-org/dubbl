import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, invoice } from "@/lib/db/schema";
import { eq, and, isNull, desc, gt } from "drizzle-orm";

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

    // Get invoices with payments (where amountPaid > 0)
    const paidInvoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, access.organizationId),
        eq(invoice.contactId, access.contactId),
        gt(invoice.amountPaid, 0),
        isNull(invoice.deletedAt)
      ),
      orderBy: desc(invoice.paidAt),
    });

    const payments = paidInvoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceId: inv.id,
      amountPaid: inv.amountPaid,
      total: inv.total,
      paidAt: inv.paidAt,
      status: inv.status,
      currencyCode: inv.currencyCode,
    }));

    return NextResponse.json({ data: payments });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
