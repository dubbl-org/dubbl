import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import { generateInvoiceHtml } from "@/lib/documents/pdf-generator";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    const template = await db.query.documentTemplate.findFirst({
      where: and(
        eq(documentTemplate.id, id),
        eq(documentTemplate.organizationId, ctx.organizationId),
        notDeleted(documentTemplate.deletedAt)
      ),
    });

    if (!template) return notFound("Template");

    const { organization } = await import("@/lib/db/schema");
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    const orgAddress = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode, org?.addressCountry]
      .filter(Boolean)
      .join(", ");

    const sampleData = {
      invoiceNumber: "INV-0001",
      issueDate: "2026-03-10",
      dueDate: "2026-04-09",
      status: "draft",
      contactName: "Sample Customer",
      contactEmail: "customer@example.com",
      contactAddress: "123 Main St, Suite 100, New York, NY 10001",
      contactTaxNumber: "US123456789",
      lines: [
        { description: "Web Development Services", quantity: 100, unitPrice: 15000, taxAmount: 1500, amount: 15000 },
        { description: "UI/UX Design", quantity: 200, unitPrice: 7500, taxAmount: 1500, amount: 15000 },
      ],
      subtotal: 30000,
      taxTotal: 3000,
      total: 33000,
      currencyCode: "USD",
      reference: "PO-123",
      notes: null,
    };

    const orgInfo = {
      name: org?.name || "Your Company",
      address: orgAddress || null,
      taxId: org?.taxId || null,
      registrationNumber: org?.businessRegistrationNumber || null,
      phone: org?.contactPhone || null,
      email: org?.contactEmail || null,
      countryCode: org?.countryCode || null,
    };

    if (format === "pdf") {
      const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");
      const pdfBuffer = await renderInvoicePdf(
        {
          invoiceNumber: sampleData.invoiceNumber,
          issueDate: sampleData.issueDate,
          dueDate: sampleData.dueDate,
          lines: sampleData.lines,
          subtotal: sampleData.subtotal,
          taxTotal: sampleData.taxTotal,
          total: sampleData.total,
          amountPaid: 0,
          amountDue: sampleData.total,
          currencyCode: sampleData.currencyCode,
          reference: sampleData.reference,
          notes: sampleData.notes,
        },
        orgInfo,
        {
          name: sampleData.contactName,
          email: sampleData.contactEmail,
          address: sampleData.contactAddress,
          taxNumber: sampleData.contactTaxNumber,
        },
        template
      );

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sample-invoice.pdf"`,
        },
      });
    }

    const html = generateInvoiceHtml(sampleData, orgInfo, template);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
