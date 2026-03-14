import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentEmailLog, organization } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerEmailTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "send_document_email",
    "Send an email for a document (invoice, quote, credit_note, purchase_order, debit_note). Does not change document status - use the send action for that. Checks email limits.",
    {
      documentType: z
        .enum(["invoice", "quote", "credit_note", "purchase_order", "debit_note"])
        .describe("Type of document"),
      documentId: z
        .string()
        .uuid()
        .describe("UUID of the document"),
      recipientEmail: z
        .string()
        .email()
        .describe("Email address of the recipient"),
      subject: z
        .string()
        .min(1)
        .describe("Email subject line"),
      body: z
        .string()
        .min(1)
        .describe("Email body content (HTML supported)"),
      attachPdf: z
        .boolean()
        .default(false)
        .describe("Whether to attach a PDF (only supported for invoices)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });

        let pdfBuffer: Buffer | undefined;
        let pdfFilename: string | undefined;

        if (params.attachPdf && params.documentType === "invoice") {
          try {
            const { invoice } = await import("@/lib/db/schema");
            const { renderInvoicePdf } = await import("@/lib/documents/pdf-renderer");
            const inv = await db.query.invoice.findFirst({
              where: and(
                eq(invoice.id, params.documentId),
                eq(invoice.organizationId, ctx.organizationId)
              ),
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
            // PDF generation failed
          }
        }

        const result = await sendDocumentEmail({
          orgId: ctx.organizationId,
          userId: ctx.userId,
          documentType: params.documentType,
          documentId: params.documentId,
          recipientEmail: params.recipientEmail,
          subject: params.subject,
          body: params.body,
          attachPdf: params.attachPdf,
          pdfBuffer,
          pdfFilename,
          replyTo: org?.contactEmail || undefined,
        });

        return { success: true, emailLogId: result.id, status: result.status };
      })
  );

  server.tool(
    "list_document_emails",
    "List email history for a document. Returns all emails sent for the given document, ordered by most recent first.",
    {
      documentType: z
        .enum(["invoice", "quote", "credit_note", "purchase_order", "debit_note"])
        .describe("Type of document"),
      documentId: z
        .string()
        .uuid()
        .describe("UUID of the document"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const emails = await db.query.documentEmailLog.findMany({
          where: and(
            eq(documentEmailLog.organizationId, ctx.organizationId),
            eq(documentEmailLog.documentType, params.documentType),
            eq(documentEmailLog.documentId, params.documentId)
          ),
          orderBy: desc(documentEmailLog.sentAt),
        });

        return {
          emails: emails.map((e) => ({
            id: e.id,
            recipientEmail: e.recipientEmail,
            subject: e.subject,
            status: e.status,
            attachPdf: e.attachPdf,
            sentAt: e.sentAt.toISOString(),
            errorMessage: e.errorMessage,
          })),
          count: emails.length,
        };
      })
  );

  server.tool(
    "resend_document_email",
    "Resend a previously sent document email by its log ID. Creates a new email log entry. Re-generates PDF for invoices if the original had an attachment.",
    {
      emailLogId: z
        .string()
        .uuid()
        .describe("UUID of the email log entry to resend"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const logEntry = await db.query.documentEmailLog.findFirst({
          where: and(
            eq(documentEmailLog.id, params.emailLogId),
            eq(documentEmailLog.organizationId, ctx.organizationId)
          ),
        });

        if (!logEntry) {
          throw new Error("Email log entry not found");
        }

        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });

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
            // PDF generation failed
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

        return { success: true, emailLogId: result.id, status: result.status };
      })
  );
}
