import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken, invoice, documentTemplate, organization } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, error, handleError } from "@/lib/api/response";
import { generateInvoiceHtml } from "@/lib/documents/pdf-generator";

export async function GET(
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

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, access.organizationId),
        eq(invoice.contactId, access.contactId)
      ),
      with: { lines: true, contact: true },
    });

    if (!inv) return notFound("Invoice");

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, access.organizationId),
    });

    const template = await db.query.documentTemplate.findFirst({
      where: and(
        eq(documentTemplate.organizationId, access.organizationId),
        eq(documentTemplate.type, "invoice"),
        eq(documentTemplate.isDefault, true),
        notDeleted(documentTemplate.deletedAt)
      ),
    });

    const orgAddress = [org?.addressStreet, org?.addressCity, org?.addressState]
      .filter(Boolean)
      .join(", ");

    const html = generateInvoiceHtml(
      {
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        status: inv.status,
        contactName: inv.contact?.name || "Unknown",
        contactEmail: inv.contact?.email || null,
        lines: inv.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxAmount: l.taxAmount,
          amount: l.amount,
        })),
        subtotal: inv.subtotal,
        taxTotal: inv.taxTotal,
        total: inv.total,
        currencyCode: inv.currencyCode,
        reference: inv.reference,
        notes: inv.notes,
      },
      { name: org?.name || "Company", address: orgAddress || null, taxId: org?.taxId || null },
      template || {}
    );

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
