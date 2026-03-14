import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentEmailLog, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { sendDocumentEmail } from "@/lib/email/document-sender";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const logEntry = await db.query.documentEmailLog.findFirst({
      where: and(
        eq(documentEmailLog.id, id),
        eq(documentEmailLog.organizationId, ctx.organizationId)
      ),
    });

    if (!logEntry) return notFound("Email log entry");

    // Get org email for reply-to
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    // Re-generate PDF for invoices if original had attachment
    let pdfBuffer: Buffer | undefined;
    let pdfFilename: string | undefined;

    if (logEntry.attachPdf && logEntry.documentType === "invoice") {
      try {
        const { invoice } = await import("@/lib/db/schema");
        const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");

        const inv = await db.query.invoice.findFirst({
          where: eq(invoice.id, logEntry.documentId),
          with: { lines: true, contact: true },
        });

        if (inv) {
          const buf = await renderInvoicePdf(
            {
              invoiceNumber: inv.invoiceNumber,
              issueDate: inv.issueDate,
              dueDate: inv.dueDate,
              currencyCode: "USD",
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
              notes: inv.notes,
            },
            { name: org?.name || "" },
            inv.contact ? { name: inv.contact.name } : { name: "Unknown" },
            {}
          );
          pdfBuffer = Buffer.from(buf);
          pdfFilename = `invoice-${inv.invoiceNumber}.pdf`;
        }
      } catch {
        // PDF generation failed, resend without attachment
      }
    }

    const result = await sendDocumentEmail({
      orgId: ctx.organizationId,
      userId: ctx.userId,
      documentType: logEntry.documentType,
      documentId: logEntry.documentId,
      recipientEmail: logEntry.recipientEmail,
      subject: logEntry.subject,
      body: logEntry.body,
      attachPdf: logEntry.attachPdf,
      pdfBuffer,
      pdfFilename,
      replyTo: org?.contactEmail || undefined,
    });

    return NextResponse.json({ emailLog: result });
  } catch (err) {
    return handleError(err);
  }
}
