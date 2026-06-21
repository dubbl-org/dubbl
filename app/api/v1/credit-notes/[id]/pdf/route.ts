import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, documentTemplate, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import { generateCreditNoteHtml, type DocumentData } from "@/lib/documents/pdf-generator";
import { formatContactAddress } from "@/lib/documents/snapshots";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    const found = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
      with: {
        lines: true,
        contact: true,
      },
    });

    if (!found) return notFound("Credit note");

    // Credit notes reuse the invoice template if a default one exists; there is
    // no dedicated credit_note template type in the enum, so fall back to invoice.
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
    const orgInfo = {
      name: org?.name || "Company",
      address: orgAddress || null,
      taxId: org?.taxId || null,
      registrationNumber: org?.businessRegistrationNumber || null,
      phone: org?.contactPhone || null,
      email: org?.contactEmail || null,
      countryCode: org?.countryCode || null,
    };

    const contactAddress = formatContactAddress(
      found.contact?.addresses as Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null
    );

    const docData: DocumentData = {
      documentNumber: found.creditNoteNumber,
      issueDate: found.issueDate,
      secondDate: null,
      contactName: found.contact?.name ?? "Unknown",
      contactEmail: found.contact?.email ?? null,
      contactAddress,
      contactTaxNumber: found.contact?.taxNumber ?? null,
      lines: found.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        amount: l.amount,
      })),
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
      const pdfBuffer = await renderInvoicePdf(
        {
          invoiceNumber: docData.documentNumber,
          issueDate: docData.issueDate,
          dueDate: docData.issueDate,
          lines: docData.lines,
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
          title: "Credit Note",
          numberLabel: "Credit note number",
          partyLabel: "Credit to",
          amountLabel: "Credit total",
        }
      );

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="credit-note-${found.creditNoteNumber}.pdf"`,
        },
      });
    }

    const html = generateCreditNoteHtml(docData, orgInfo, templateSettings);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
