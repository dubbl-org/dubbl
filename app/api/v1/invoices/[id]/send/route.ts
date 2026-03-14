import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createInvoiceJournalEntry } from "@/lib/api/journal-automation";
import { buildSenderSnapshot, buildRecipientSnapshot } from "@/lib/documents/snapshots";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
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
});

const sendBodySchema = z.object({
  sendEmail: z.literal(true),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  templateProps: templatePropsSchema,
  attachPdf: z.boolean().default(true),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
      with: { lines: true, contact: true },
    });

    if (!found) return notFound("Invoice");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be sent" },
        { status: 400 }
      );
    }

    // Parse optional email body
    const rawBody = await request.json().catch(() => ({}));
    const emailParsed = sendBodySchema.safeParse(rawBody);

    // Send email if requested
    if (emailParsed.success) {
      const { recipientEmail, subject, templateProps, attachPdf } = emailParsed.data;

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
              currencyCode: "USD",
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

    // Create journal entry
    const entry = await createInvoiceJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        invoiceNumber: found.invoiceNumber,
        total: found.total,
        taxTotal: found.taxTotal,
        subtotal: found.subtotal,
        lines: found.lines.map((l) => ({
          accountId: l.accountId,
          amount: l.amount,
          taxAmount: l.taxAmount,
        })),
        date: found.issueDate,
      }
    );

    // Snapshot org and contact details at send time
    const senderSnapshot = await buildSenderSnapshot(ctx.organizationId);
    const recipientSnapshot = found.contact
      ? buildRecipientSnapshot(found.contact)
      : { name: "Unknown", email: null, address: null, taxNumber: null };

    const [updated] = await db
      .update(invoice)
      .set({
        status: "sent",
        sentAt: new Date(),
        journalEntryId: entry?.id || null,
        senderSnapshot,
        recipientSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, id))
      .returning();

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    return handleError(err);
  }
}
