import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import {
  generateDocumentHtml,
  generatePayslipHtml,
  type DocumentData,
  type DocumentKind,
} from "@/lib/documents/pdf-generator";
import type { PdfDocumentLabels, PdfPayslipData } from "@/lib/documents/pdf-renderer";
import { loadOrgInfo } from "@/lib/documents/templates";

// Sample document for each template type, so the preview shows the template
// on the kind of document it's actually used for.
const SAMPLE_DOC: DocumentData = {
  documentNumber: "INV-0001",
  issueDate: "2026-03-10",
  secondDate: "2026-04-09",
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
  amountPaid: 0,
  amountDue: 33000,
  currencyCode: "USD",
  reference: "PO-123",
  notes: null,
};

const SAMPLES: Record<
  "invoice" | "quote" | "receipt" | "purchase_order",
  { kind: DocumentKind; doc: DocumentData; labels?: PdfDocumentLabels; fileName: string }
> = {
  invoice: { kind: "invoice", doc: SAMPLE_DOC, fileName: "sample-invoice.pdf" },
  quote: {
    kind: "quote",
    doc: { ...SAMPLE_DOC, documentNumber: "QTE-0001", secondDate: "2026-04-09" },
    labels: { title: "Quote", numberLabel: "Quote number", partyLabel: "Quote for", amountLabel: "Total", dateLabel: "Valid until", summaryNoun: "valid until" },
    fileName: "sample-quote.pdf",
  },
  receipt: {
    kind: "sales_receipt",
    doc: { ...SAMPLE_DOC, documentNumber: "SR-0001", secondDate: null, reference: null },
    labels: { title: "Receipt", numberLabel: "Receipt number", partyLabel: "Sold to", amountLabel: "Total paid", dateLabel: null, summaryNoun: "paid", paymentTerms: false },
    fileName: "sample-receipt.pdf",
  },
  purchase_order: {
    kind: "purchase_order",
    doc: { ...SAMPLE_DOC, documentNumber: "PO-0001", contactName: "Sample Supplier", contactEmail: "supplier@example.com", reference: null },
    labels: { title: "Purchase Order", numberLabel: "PO number", partyLabel: "Supplier", amountLabel: "Order total", dateLabel: "Delivery date", summaryNoun: null },
    fileName: "sample-purchase-order.pdf",
  },
};

const SAMPLE_PAYSLIP: PdfPayslipData = {
  employeeName: "Sample Employee",
  employeeNumber: "EMP-001",
  position: "Designer",
  department: "Product",
  employeeEmail: "employee@example.com",
  payPeriodStart: "2026-03-01",
  payPeriodEnd: "2026-03-31",
  payDate: "2026-03-31",
  currencyCode: "USD",
  earnings: [
    { description: "Salary", amount: 500000 },
    { description: "Overtime (4 h)", amount: 30000 },
  ],
  grossAmount: 530000,
  taxAmount: 106000,
  taxLines: [
    { description: "Income tax", amount: 65455 },
    { description: "Social security", amount: 32860 },
    { description: "Medicare", amount: 7685 },
  ],
  deductions: [{ description: "Retirement plan", amount: 26500 }],
  netAmount: 397500,
  ytdGross: 1590000,
  ytdTax: 318000,
  ytdNet: 1192500,
};

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

    const orgInfo = await loadOrgInfo(ctx.organizationId);

    if (template.type === "payslip") {
      if (format === "pdf") {
        const { renderPayslipPdf } = await import("@/lib/documents/pdf-renderer");
        const pdfBuffer = await renderPayslipPdf(SAMPLE_PAYSLIP, orgInfo, template);
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="sample-payslip.pdf"`,
          },
        });
      }
      return new NextResponse(generatePayslipHtml(SAMPLE_PAYSLIP, orgInfo, template), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const sample = SAMPLES[template.type];

    if (format === "pdf") {
      const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");
      const doc = sample.doc;
      const pdfBuffer = await renderInvoicePdf(
        {
          invoiceNumber: doc.documentNumber,
          issueDate: doc.issueDate,
          dueDate: doc.secondDate || doc.issueDate,
          lines: doc.lines,
          subtotal: doc.subtotal,
          taxTotal: doc.taxTotal,
          total: doc.total,
          amountPaid: 0,
          amountDue: doc.total,
          currencyCode: doc.currencyCode,
          reference: doc.reference,
          notes: doc.notes,
        },
        orgInfo,
        {
          name: doc.contactName,
          email: doc.contactEmail,
          address: doc.contactAddress,
          taxNumber: doc.contactTaxNumber,
        },
        template,
        sample.labels
      );

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sample.fileName}"`,
        },
      });
    }

    const html = generateDocumentHtml(sample.kind, sample.doc, orgInfo, template);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
