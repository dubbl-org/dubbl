import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, documentTemplate, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import { generateInvoiceHtml } from "@/lib/documents/pdf-generator";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId)
      ),
      with: {
        lines: true,
        contact: true,
      },
    });

    if (!inv) return notFound("Invoice");

    // Find default template
    const template = await db.query.documentTemplate.findFirst({
      where: and(
        eq(documentTemplate.organizationId, ctx.organizationId),
        eq(documentTemplate.type, "invoice"),
        eq(documentTemplate.isDefault, true),
        notDeleted(documentTemplate.deletedAt)
      ),
    });

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    const orgAddress = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode, org?.addressCountry]
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
      {
        name: org?.name || "Company",
        address: orgAddress || null,
        taxId: org?.taxId || null,
      },
      template || {}
    );

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
