import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentEmailLog, organization } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
import { formatMoney } from "@/lib/money";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerEmailTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "send_document_email",
    "Send a branded email for a document (invoice, quote, credit_note, purchase_order, debit_note). The email uses the dubbl template with document details (number, amount, dates). You provide the document info and an optional personal message. Does not change document status - use the send action for that. Checks email limits. Amounts in cents.",
    {
      documentType: z
        .enum(["invoice", "quote", "credit_note", "purchase_order", "debit_note"])
        .describe("Type of document"),
      documentId: z
        .string()
        .uuid()
        .describe("UUID of the document"),
      documentNumber: z
        .string()
        .describe("Document number (e.g. INV-00042)"),
      recipientEmail: z
        .string()
        .email()
        .describe("Email address of the recipient"),
      recipientName: z
        .string()
        .describe("Name of the recipient"),
      personalMessage: z
        .string()
        .optional()
        .describe("Optional personal message to include above the document details"),
      amountCents: z
        .number()
        .int()
        .optional()
        .describe("Amount due in integer cents (e.g. 125000 for $1,250.00)"),
      dueDate: z
        .string()
        .optional()
        .describe("Due date in YYYY-MM-DD format"),
      issueDate: z
        .string()
        .optional()
        .describe("Issue date in YYYY-MM-DD format"),
      attachPdf: z
        .boolean()
        .default(false)
        .describe("Whether to attach a PDF (only supported for invoices)"),
      buttonLabel: z
        .string()
        .optional()
        .describe("Custom label for the CTA button in the email (e.g. 'Pay invoice', 'View quote'). Falls back to 'View {type}'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });

        const fmtDate = (d?: string) => {
          if (!d) return undefined;
          return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        };

        const subject = `${params.documentType.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} ${params.documentNumber} from ${org?.name || ""}`;

        const html = await renderDocumentEmailHtml({
          organizationName: org?.name || "",
          contactName: params.recipientName,
          documentType: params.documentType,
          documentNumber: params.documentNumber,
          personalMessage: params.personalMessage,
          amountFormatted: params.amountCents != null ? formatMoney(params.amountCents) : undefined,
          dueDateFormatted: fmtDate(params.dueDate),
          issueDateFormatted: fmtDate(params.issueDate),
          buttonLabel: params.buttonLabel,
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
          subject,
          body: html,
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
