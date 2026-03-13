import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, documentTemplate, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import { generateInvoiceHtml } from "@/lib/documents/pdf-generator";

function formatContactAddress(addresses: Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null): string | null {
  if (!addresses) return null;
  const billing = addresses.billing || Object.values(addresses)[0];
  if (!billing) return null;
  return [billing.line1, billing.line2, billing.city, billing.state, billing.postalCode, billing.country]
    .filter(Boolean)
    .join(", ");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

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

    const contactAddress = formatContactAddress(inv.contact?.addresses as Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null);

    const invoiceData = {
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      status: inv.status,
      contactName: inv.contact?.name || "Unknown",
      contactEmail: inv.contact?.email || null,
      contactAddress,
      contactTaxNumber: inv.contact?.taxNumber || null,
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
      amountPaid: inv.amountPaid,
      amountDue: inv.amountDue,
      currencyCode: inv.currencyCode,
      reference: inv.reference,
      notes: inv.notes,
    };

    const orgInfo = {
      name: org?.name || "Company",
      address: orgAddress || null,
      taxId: org?.taxId || null,
      registrationNumber: org?.businessRegistrationNumber || null,
      phone: org?.contactPhone || null,
      email: org?.contactEmail || null,
      countryCode: org?.countryCode || null,
    };

    const templateSettings = template || {};

    if (format === "pdf") {
      const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");
      const pdfBuffer = await renderInvoicePdf(
        {
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          lines: invoiceData.lines,
          subtotal: inv.subtotal,
          taxTotal: inv.taxTotal,
          total: inv.total,
          amountPaid: inv.amountPaid,
          amountDue: inv.amountDue,
          currencyCode: inv.currencyCode,
          reference: inv.reference,
          notes: inv.notes,
        },
        orgInfo,
        {
          name: inv.contact?.name || "Unknown",
          email: inv.contact?.email || null,
          address: contactAddress,
          taxNumber: inv.contact?.taxNumber || null,
        },
        templateSettings
      );

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="invoice-${inv.invoiceNumber}.pdf"`,
        },
      });
    }

    const html = generateInvoiceHtml(invoiceData, orgInfo, templateSettings);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
