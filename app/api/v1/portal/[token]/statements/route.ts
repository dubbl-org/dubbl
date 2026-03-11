import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, invoice } from "@/lib/db/schema";
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

    const invoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, access.organizationId),
        eq(invoice.contactId, access.contactId),
        isNull(invoice.deletedAt)
      ),
      orderBy: desc(invoice.issueDate),
    });

    // Build statement with running balance
    let runningBalance = 0;
    const statementLines = invoices.map(inv => {
      runningBalance += inv.amountDue;
      return {
        date: inv.issueDate,
        description: `Invoice ${inv.invoiceNumber}`,
        amount: inv.total,
        paid: inv.amountPaid,
        balance: inv.amountDue,
        runningBalance,
        status: inv.status,
      };
    });

    return NextResponse.json({
      contact: { id: access.contactId, name: access.contact.name },
      organization: { name: access.organization.name },
      lines: statementLines,
      totalOutstanding: runningBalance,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
