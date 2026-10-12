import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentEmailLog, organization } from "@/lib/db/schema";
import { eq, and, desc, ilike, or, count } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
import { formatMoney } from "@/lib/money";
import type { AuthContext } from "@/lib/api/auth-context";
import { describeRecords } from "@/lib/documents/records";
import { requireRole } from "@/lib/api/require-role";
import { getEmailSettings, removeEmailSettings, saveEmailSettings, testEmailSettings } from "@/lib/email/email-settings";

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

  server.tool(
    "list_sent_document_emails",
    "List every document email the workspace has sent (invoices, quotes, credit notes, purchase orders, supplier credits, remittance advice), newest first. Optional filters: documentType, status ('sent' or 'failed') and search (matches recipient or subject). Each entry includes the recipient, subject, status, error message when it failed, when it was sent, who sent it and the document it was about ({ kind, label such as 'INV-0042 · Acme', href }). Use resend_document_email with an entry's id to send it again.",
    {
      documentType: z
        .enum(["invoice", "quote", "credit_note", "purchase_order", "debit_note", "remittance_advice"])
        .optional()
        .describe("Only emails about this kind of document"),
      status: z.enum(["sent", "failed"]).optional().describe("Only sent or only failed emails"),
      search: z.string().optional().describe("Case-insensitive match on the recipient address or subject"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Emails per page (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(documentEmailLog.organizationId, ctx.organizationId)];
        if (params.documentType) conditions.push(eq(documentEmailLog.documentType, params.documentType));
        if (params.status) conditions.push(eq(documentEmailLog.status, params.status));
        if (params.search) {
          const q = `%${params.search}%`;
          conditions.push(or(ilike(documentEmailLog.recipientEmail, q), ilike(documentEmailLog.subject, q))!);
        }
        const where = and(...conditions);
        const [{ total }] = await db.select({ total: count() }).from(documentEmailLog).where(where);
        const rows = await db.query.documentEmailLog.findMany({
          where,
          orderBy: desc(documentEmailLog.sentAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: { sentByUser: { columns: { id: true, name: true, email: true } } },
        });
        const records = await describeRecords(ctx.organizationId, rows.map((r) => ({ type: r.documentType, id: r.documentId })));
        return {
          emails: rows.map((e) => ({
            id: e.id,
            documentType: e.documentType,
            documentId: e.documentId,
            document: records.get(`${e.documentType}:${e.documentId}`) ?? null,
            recipientEmail: e.recipientEmail,
            subject: e.subject,
            status: e.status,
            errorMessage: e.errorMessage,
            attachPdf: e.attachPdf,
            sentAt: e.sentAt.toISOString(),
            sentBy: e.sentByUser ? { name: e.sentByUser.name, email: e.sentByUser.email } : null,
          })),
          pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
        };
      })
  );

  // --- Workspace mail server (SMTP) ---

  server.tool(
    "get_email_settings",
    "Show how the workspace sends document emails: its own mail server (SMTP host, port, username, from address and name, reply-to, TLS, and whether the connection is verified) or, when this returns null, dubbl's shared sender. The password is never returned; hasPassword says whether one is saved.",
    {},
    () => wrapTool(ctx, async () => ({ emailConfig: await getEmailSettings(ctx.organizationId) }))
  );

  server.tool(
    "save_email_settings",
    "Set up or change the workspace's own outgoing mail server, so invoices and quotes are emailed from the business's address. Checks the login straight away; isVerified in the result says whether the server accepted it (only verified settings are used for sending). smtpPassword can be left out on later changes to keep the saved one. Requires the manage:banking permission.",
    {
      smtpHost: z.string().min(1).describe("Mail server host, e.g. 'smtp.gmail.com'"),
      smtpPort: z.number().int().min(1).max(65535).optional().default(587).describe("Port, usually 587 (STARTTLS) or 465 (SSL)"),
      smtpUsername: z.string().min(1).describe("Login username, often the email address"),
      smtpPassword: z.string().min(1).optional().describe("Login password or app password. Omit to keep the saved one"),
      fromEmail: z.string().email().describe("Address emails come from, e.g. 'billing@acme.com'"),
      fromName: z.string().nullable().optional().describe("Sender name shown to recipients, e.g. 'Acme Ltd'"),
      replyTo: z.string().email().nullable().optional().describe("Where replies go, if different from fromEmail"),
      useTls: z.boolean().optional().default(true).describe("Encrypt the connection (recommended)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");
        const result = await saveEmailSettings(ctx.organizationId, params);
        return { emailConfig: result.emailConfig };
      })
  );

  server.tool(
    "send_test_email",
    "Send a test message through the workspace's own mail server to its from-address. Marks the settings verified when it goes through. Requires the manage:banking permission. Returns { sentTo }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");
        return testEmailSettings(ctx.organizationId);
      })
  );

  server.tool(
    "remove_email_settings",
    "Forget the workspace's own mail server, so document emails go out from dubbl's shared sender again. Requires the manage:banking permission. Returns { removed }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");
        return removeEmailSettings(ctx.organizationId);
      })
  );
}
