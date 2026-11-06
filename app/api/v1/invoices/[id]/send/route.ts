import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { InvoiceSendError, loadDraftForSending, postDraftInvoice } from "@/lib/api/invoice-send";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
import { randomBytes } from "crypto";
import { z } from "zod";

const templatePropsSchema = z.object({
  organizationName: z.string(),
  contactName: z.string(),
  documentType: z.string(),
  documentNumber: z.string(),
  personalMessage: z.string().optional(),
  amountFormatted: z.string().optional(),
  dueDateFormatted: z.string().optional(),
  issueDateFormatted: z.string().optional(),
  viewUrl: z.string().optional(),
  buttonLabel: z.string().optional(),
});

const sendBodySchema = z.object({
  sendEmail: z.literal(true),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  templateProps: templatePropsSchema,
  attachPdf: z.boolean().default(true),
  includePaymentLink: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    // Draft check, lock date and FX rate, all before any email goes out.
    const found = await loadDraftForSending(ctx, id);

    // Parse optional email body
    const rawBody = await request.json().catch(() => ({}));
    const emailParsed = sendBodySchema.safeParse(rawBody);

    // Send email if requested
    if (emailParsed.success) {
      const { recipientEmail, subject, templateProps, attachPdf, includePaymentLink } = emailParsed.data;

      // Generate payment link if requested
      if (includePaymentLink) {
        let paymentLinkToken = found.paymentLinkToken;
        if (!paymentLinkToken) {
          paymentLinkToken = randomBytes(24).toString("hex");
          await db
            .update(invoice)
            .set({ paymentLinkToken, updatedAt: new Date() })
            .where(eq(invoice.id, id));
        }
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        templateProps.viewUrl = `${APP_URL}/pay/${paymentLinkToken}`;
        templateProps.buttonLabel = "Pay invoice";
      }

      // Render the structured email template to HTML
      const html = await renderDocumentEmailHtml(templateProps);

      let pdfBuffer: Buffer | undefined;
      let pdfFilename: string | undefined;

      if (attachPdf) {
        try {
          const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");
          const org = await db.query.organization.findFirst({
            where: eq(organization.id, ctx.organizationId),
          });
          const buf = await renderInvoicePdf(
            {
              invoiceNumber: found.invoiceNumber,
              issueDate: found.issueDate,
              dueDate: found.dueDate,
              currencyCode: found.currencyCode,
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
              notes: found.notes,
            },
            { name: org?.name || "" },
            found.contact ? { name: found.contact.name } : { name: "Unknown" },
            {}
          );
          pdfBuffer = Buffer.from(buf);
          pdfFilename = `invoice-${found.invoiceNumber}.pdf`;
        } catch {
          // PDF generation failed, send without attachment
        }
      }

      // Get org contact email for reply-to
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
      });

      await sendDocumentEmail({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        documentType: "invoice",
        documentId: id,
        recipientEmail,
        subject,
        body: html,
        attachPdf,
        pdfBuffer,
        pdfFilename,
        replyTo: org?.contactEmail || undefined,
      });
    }

    // Post the sale (and COGS) and mark it sent, in one transaction.
    const { invoice: updated } = await postDraftInvoice(ctx, id);

    logAudit({ ctx, action: "send", entityType: "invoice", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof InvoiceSendError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
