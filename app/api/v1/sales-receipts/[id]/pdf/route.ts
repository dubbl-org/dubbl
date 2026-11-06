import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesReceipt } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import { generateSalesReceiptHtml, type DocumentData } from "@/lib/documents/pdf-generator";
import { formatContactAddress } from "@/lib/documents/snapshots";
import { getDefaultTemplate, loadOrgInfo } from "@/lib/documents/templates";

// Receipt for a cash sale. Uses the organization's default "receipt" template.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    const found = await db.query.salesReceipt.findFirst({
      where: and(
        eq(salesReceipt.id, id),
        eq(salesReceipt.organizationId, ctx.organizationId),
        notDeleted(salesReceipt.deletedAt)
      ),
      with: {
        lines: true,
        contact: true,
      },
    });

    if (!found) return notFound("Sales receipt");

    const template = await getDefaultTemplate(ctx.organizationId, "receipt");
    const orgInfo = await loadOrgInfo(ctx.organizationId);

    const contactAddress = formatContactAddress(
      found.contact?.addresses as Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null
    );

    const lines = [...found.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxAmount: l.taxAmount,
        amount: l.amount,
      }));

    const docData: DocumentData = {
      documentNumber: found.receiptNumber,
      issueDate: found.date,
      secondDate: null,
      contactName: found.contact?.name ?? "Unknown",
      contactEmail: found.contact?.email ?? null,
      contactAddress,
      contactTaxNumber: found.contact?.taxNumber ?? null,
      lines,
      subtotal: found.subtotal,
      taxTotal: found.taxTotal,
      total: found.total,
      currencyCode: found.currencyCode,
      reference: found.reference,
      notes: found.notes,
    };

    const templateSettings = template || {};

    if (format === "pdf") {
      const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");
      const statusSuffix = found.status === "draft" ? " (Draft)" : found.status === "void" ? " (Void)" : "";
      const pdfBuffer = await renderInvoicePdf(
        {
          invoiceNumber: docData.documentNumber,
          issueDate: docData.issueDate,
          dueDate: docData.issueDate,
          lines,
          subtotal: docData.subtotal,
          taxTotal: docData.taxTotal,
          total: docData.total,
          currencyCode: docData.currencyCode,
          reference: docData.reference,
          notes: docData.notes,
        },
        orgInfo,
        {
          name: docData.contactName,
          email: docData.contactEmail,
          address: contactAddress,
          taxNumber: docData.contactTaxNumber,
        },
        templateSettings,
        {
          title: `Receipt${statusSuffix}`,
          numberLabel: "Receipt number",
          partyLabel: "Sold to",
          amountLabel: found.status === "paid" ? "Total paid" : "Total",
          // Paid on the spot: no due date, the headline reads "{total} paid {date}".
          dateLabel: null,
          summaryNoun: found.status === "paid" ? "paid" : null,
          paymentTerms: false,
        }
      );

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="receipt-${found.receiptNumber}.pdf"`,
        },
      });
    }

    const html = generateSalesReceiptHtml(docData, orgInfo, templateSettings);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
