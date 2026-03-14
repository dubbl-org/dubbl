import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoice, invoiceLine, invoiceSignature, emailConfig, organization, contact } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { wrapTool } from "@/lib/mcp/errors";
import { checkMonthlyLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { sendEmail } from "@/lib/email/smtp-client";
import { randomBytes } from "crypto";
import type { AuthContext } from "@/lib/api/auth-context";
import { checkInvoiceCompliance } from "@/lib/documents/compliance";

export function registerInvoiceTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_invoices",
    "List invoices with optional filters. Amounts (subtotal, total, amountPaid, amountDue) are in integer cents.",
    {
      status: z
        .enum(["draft", "sent", "partial", "paid", "overdue", "void"])
        .optional()
        .describe("Filter by invoice status"),
      contactId: z
        .string()
        .optional()
        .describe("Filter by contact UUID"),
      startDate: z
        .string()
        .optional()
        .describe("Filter by issue date from (YYYY-MM-DD)"),
      endDate: z
        .string()
        .optional()
        .describe("Filter by issue date to (YYYY-MM-DD)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of invoices to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(invoice.organizationId, ctx.organizationId),
          notDeleted(invoice.deletedAt),
        ];

        if (params.status) {
          conditions.push(eq(invoice.status, params.status));
        }
        if (params.contactId) {
          conditions.push(eq(invoice.contactId, params.contactId));
        }
        if (params.startDate) {
          conditions.push(gte(invoice.issueDate, params.startDate));
        }
        if (params.endDate) {
          conditions.push(lte(invoice.issueDate, params.endDate));
        }

        const offset = (params.page - 1) * params.limit;

        const invoices = await db.query.invoice.findMany({
          where: and(...conditions),
          orderBy: desc(invoice.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(invoice)
          .where(and(...conditions));

        return {
          invoices,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_invoice",
    "Get a single invoice by ID with line items, contact, and payment history. All amounts are in integer cents.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
          with: {
            contact: true,
            lines: {
              with: { account: true, taxRate: true },
            },
          },
        });

        if (!found) throw new Error("Invoice not found");
        return { invoice: found };
      })
  );

  server.tool(
    "create_invoice",
    "Create a new invoice with line items. Unit prices are decimal numbers (e.g. 12.50 for $12.50). Quantities are decimal numbers. The system calculates totals and assigns an invoice number automatically.",
    {
      contactId: z.string().describe("Customer contact UUID"),
      issueDate: z.string().describe("Issue date (YYYY-MM-DD)"),
      dueDate: z
        .string()
        .optional()
        .describe("Due date (YYYY-MM-DD). If omitted, auto-calculated from contact payment terms or org default."),
      reference: z
        .string()
        .optional()
        .describe("External reference"),
      notes: z.string().optional().describe("Invoice notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code"),
      lines: z
        .array(
          z.object({
            description: z.string().describe("Line item description"),
            quantity: z
              .number()
              .optional()
              .default(1)
              .describe("Quantity (decimal)"),
            unitPrice: z
              .number()
              .optional()
              .default(0)
              .describe("Unit price (decimal, e.g. 12.50)"),
            accountId: z
              .string()
              .optional()
              .describe("Revenue account UUID"),
            taxRateId: z
              .string()
              .optional()
              .describe("Tax rate UUID"),
            discountPercent: z
              .number()
              .int()
              .min(0)
              .max(10000)
              .optional()
              .default(0)
              .describe("Discount in basis points (1000 = 10%)"),
          })
        )
        .min(1)
        .describe("Invoice line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        await assertNotLocked(ctx.organizationId, params.issueDate);
        await checkMonthlyLimit(ctx.organizationId, invoice, invoice.organizationId, invoice.createdAt, "invoicesPerMonth", invoice.deletedAt);
        await checkMultiCurrency(ctx.organizationId, params.currencyCode ?? "USD");

        // Auto-calculate due date if not provided
        let dueDate = params.dueDate;
        if (!dueDate) {
          const contactRecord = await db.query.contact.findFirst({
            where: eq(contact.id, params.contactId),
            columns: { paymentTermsDays: true },
          });
          let termsDays = contactRecord?.paymentTermsDays;
          if (termsDays == null) {
            const org = await db.query.organization.findFirst({
              where: eq(organization.id, ctx.organizationId),
              columns: { defaultPaymentTerms: true },
            });
            termsDays = org?.defaultPaymentTerms ? parseInt(org.defaultPaymentTerms) : 30;
          }
          const d = new Date(params.issueDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + (termsDays || 30));
          dueDate = d.toISOString().split("T")[0];
        }

        const invoiceNumber = await getNextNumber(
          ctx.organizationId,
          "invoice",
          "invoice_number",
          "INV"
        );

        const taxRateIds = params.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
        const ratesMap = await preloadTaxRates(taxRateIds);

        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const grossAmount = decimalToCents(l.quantity * l.unitPrice);
          const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
          const amount = grossAmount - discountAmount;
          subtotal += amount;
          const taxRateId = l.taxRateId ?? null;
          const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: decimalToCents(l.unitPrice),
            accountId: l.accountId ?? null,
            taxRateId,
            discountPercent: l.discountPercent,
            taxAmount,
            amount,
            sortOrder: i,
          };
        });

        const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
        const total = subtotal + taxTotal;

        const [created] = await db
          .insert(invoice)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            invoiceNumber,
            issueDate: params.issueDate,
            dueDate,
            reference: params.reference ?? null,
            notes: params.notes ?? null,
            subtotal,
            taxTotal,
            total,
            amountPaid: 0,
            amountDue: total,
            currencyCode: params.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(invoiceLine).values(
          processedLines.map((l) => ({
            invoiceId: created.id,
            ...l,
          }))
        );

        return { invoice: created };
      })
  );

  server.tool(
    "void_invoice",
    "Void an invoice. Only non-paid invoices can be voided.",
    {
      invoiceId: z
        .string()
        .describe("The UUID of the invoice to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const existing = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!existing) throw new Error("Invoice not found");
        if (existing.status === "paid") {
          throw new Error("Cannot void a fully paid invoice");
        }
        if (existing.status === "void") {
          throw new Error("Invoice is already voided");
        }

        const [updated] = await db
          .update(invoice)
          .set({
            status: "void",
            voidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(invoice.id, params.invoiceId))
          .returning();

        return { invoice: updated };
      })
  );

  server.tool(
    "pay_invoice",
    "Record a payment against an invoice. Amount is in integer cents (e.g. 1250 = $12.50). Automatically updates the invoice status to 'paid' if fully paid or 'partial' if partially paid.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
      amount: z
        .number()
        .int()
        .min(1)
        .describe("Payment amount in cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const existing = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!existing) throw new Error("Invoice not found");
        if (existing.status === "void") {
          throw new Error("Cannot pay a voided invoice");
        }
        if (existing.status === "paid") {
          throw new Error("Invoice is already fully paid");
        }
        if (params.amount > existing.amountDue) {
          throw new Error(
            `Payment amount (${params.amount}) exceeds amount due (${existing.amountDue})`
          );
        }

        const newAmountPaid = existing.amountPaid + params.amount;
        const newAmountDue = existing.total - newAmountPaid;
        const newStatus = newAmountDue === 0 ? "paid" : "partial";

        const [updated] = await db
          .update(invoice)
          .set({
            amountPaid: newAmountPaid,
            amountDue: newAmountDue,
            status: newStatus,
            paidAt: newAmountDue === 0 ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(invoice.id, params.invoiceId))
          .returning();

        return { invoice: updated };
      })
  );

  server.tool(
    "request_invoice_signature",
    "Request an e-signature on an invoice. Sends a signing email to the signer with a unique link. Returns the created signature record.",
    {
      invoiceId: z.string().describe("The UUID of the invoice to request a signature for"),
      signerName: z.string().describe("Full name of the person who should sign"),
      signerEmail: z.string().email().describe("Email address of the signer"),
      expiresAt: z
        .string()
        .optional()
        .describe("Optional expiry date for the signing link (ISO 8601 datetime)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!inv) throw new Error("Invoice not found");

        const token = randomBytes(32).toString("base64url");

        const [sig] = await db
          .insert(invoiceSignature)
          .values({
            invoiceId: params.invoiceId,
            token,
            signerName: params.signerName,
            signerEmail: params.signerEmail,
            expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
          })
          .returning();

        // Send signing email if email is configured
        const emailCfg = await db.query.emailConfig.findFirst({
          where: eq(emailConfig.organizationId, ctx.organizationId),
        });

        let emailSent = false;
        if (emailCfg) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const signUrl = `${baseUrl}/sign/${token}`;

          await sendEmail(emailCfg, {
            to: params.signerEmail,
            subject: `Signature requested - Invoice ${inv.invoiceNumber}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Signature Request</h2>
                <p>Hello ${params.signerName},</p>
                <p>You have been asked to sign invoice <strong>${inv.invoiceNumber}</strong>.</p>
                <p>
                  <a href="${signUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                    Review & Sign
                  </a>
                </p>
                ${params.expiresAt ? `<p style="color: #6b7280; font-size: 14px;">This link expires on ${new Date(params.expiresAt).toLocaleDateString()}.</p>` : ""}
                <p style="color: #6b7280; font-size: 14px;">If you did not expect this request, you can safely ignore this email.</p>
              </div>
            `,
          });
          emailSent = true;
        }

        return { signature: sig, emailSent };
      })
  );

  server.tool(
    "get_invoice_signature",
    "Get the e-signature status for an invoice. Returns all signature records associated with the invoice.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!inv) throw new Error("Invoice not found");

        const signatures = await db.query.invoiceSignature.findMany({
          where: eq(invoiceSignature.invoiceId, params.invoiceId),
        });

        return { signatures };
      })
  );

  server.tool(
    "resend_signature_request",
    "Resend the signing email for a pending signature request on an invoice. Only resends if there is an active pending request.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!inv) throw new Error("Invoice not found");

        const sig = await db.query.invoiceSignature.findFirst({
          where: and(
            eq(invoiceSignature.invoiceId, params.invoiceId),
            eq(invoiceSignature.status, "pending")
          ),
        });

        if (!sig) throw new Error("No pending signature request found for this invoice");

        const emailCfg = await db.query.emailConfig.findFirst({
          where: eq(emailConfig.organizationId, ctx.organizationId),
        });

        if (!emailCfg) throw new Error("Email is not configured for this organization");

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const signUrl = `${baseUrl}/sign/${sig.token}`;

        await sendEmail(emailCfg, {
          to: sig.signerEmail,
          subject: `Reminder: Signature requested - Invoice ${inv.invoiceNumber}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Signature Reminder</h2>
              <p>Hello ${sig.signerName},</p>
              <p>This is a reminder that you have been asked to sign invoice <strong>${inv.invoiceNumber}</strong>.</p>
              <p>
                <a href="${signUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                  Review & Sign
                </a>
              </p>
              ${sig.expiresAt ? `<p style="color: #6b7280; font-size: 14px;">This link expires on ${new Date(sig.expiresAt).toLocaleDateString()}.</p>` : ""}
              <p style="color: #6b7280; font-size: 14px;">If you did not expect this request, you can safely ignore this email.</p>
            </div>
          `,
        });

        return { success: true, resentTo: sig.signerEmail };
      })
  );

  server.tool(
    "check_invoice_compliance",
    "Check an invoice for compliance warnings based on the organization's country. Returns an array of warnings with field, message, and severity (error/warning). Does not block invoice creation.",
    {
      invoiceId: z.string().describe("The UUID of the invoice to check"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
          with: { lines: true, contact: true },
        });

        if (!inv) throw new Error("Invoice not found");

        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });

        const orgAddress = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode, org?.addressCountry]
          .filter(Boolean)
          .join(", ");

        const contactAddresses = inv.contact?.addresses as Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null;
        let contactAddress: string | null = null;
        if (contactAddresses) {
          const billing = contactAddresses.billing || Object.values(contactAddresses)[0];
          if (billing) {
            contactAddress = [billing.line1, billing.line2, billing.city, billing.state, billing.postalCode, billing.country]
              .filter(Boolean)
              .join(", ");
          }
        }

        const warnings = checkInvoiceCompliance(
          {
            name: org?.name || null,
            address: orgAddress || null,
            taxId: org?.taxId || null,
            countryCode: org?.countryCode || null,
          },
          {
            name: inv.contact?.name || null,
            address: contactAddress,
            taxNumber: inv.contact?.taxNumber || null,
          },
          {
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            lines: inv.lines,
          }
        );

        return { warnings };
      })
  );

  server.tool(
    "get_invoice_pdf",
    "Get the download URL for an invoice PDF. Returns the URL path to download the generated PDF file.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!inv) throw new Error("Invoice not found");

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        return {
          downloadUrl: `${baseUrl}/api/v1/invoices/${params.invoiceId}/pdf?format=pdf`,
          invoiceNumber: inv.invoiceNumber,
        };
      })
  );

  server.tool(
    "get_invoice_snapshot",
    "Get the frozen sender/recipient details for a finalized invoice. These are the org and contact details captured at send time. Returns null for draft invoices.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!inv) throw new Error("Invoice not found");

        return {
          sender: inv.senderSnapshot || null,
          recipient: inv.recipientSnapshot || null,
        };
      })
  );

  server.tool(
    "update_invoice_snapshot",
    "Correct the sender or recipient details on a finalized invoice. Use this to fix typos or wrong addresses on sent/paid invoices. Only pass the fields you want to change. Cannot be used on draft invoices.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
      sender: z.object({
        name: z.string().optional().describe("Organization name"),
        address: z.string().nullable().optional().describe("Organization address"),
        taxId: z.string().nullable().optional().describe("Tax ID / VAT number"),
        registrationNumber: z.string().nullable().optional().describe("Business registration number"),
        phone: z.string().nullable().optional().describe("Phone number"),
        email: z.string().nullable().optional().describe("Email address"),
        countryCode: z.string().nullable().optional().describe("Two-letter country code"),
      }).optional().describe("Sender (organization) fields to update"),
      recipient: z.object({
        name: z.string().optional().describe("Contact name"),
        email: z.string().nullable().optional().describe("Contact email"),
        address: z.string().nullable().optional().describe("Contact address"),
        taxNumber: z.string().nullable().optional().describe("Contact tax / VAT number"),
      }).optional().describe("Recipient (contact) fields to update"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const inv = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });

        if (!inv) throw new Error("Invoice not found");
        if (inv.status === "draft") throw new Error("Draft invoices don't have snapshots, edit the invoice directly");

        const updates: Record<string, unknown> = { updatedAt: new Date() };

        if (params.sender) {
          const existing = (inv.senderSnapshot || {}) as Record<string, unknown>;
          updates.senderSnapshot = { ...existing, ...params.sender };
        }

        if (params.recipient) {
          const existing = (inv.recipientSnapshot || {}) as Record<string, unknown>;
          updates.recipientSnapshot = { ...existing, ...params.recipient };
        }

        const [updated] = await db
          .update(invoice)
          .set(updates)
          .where(eq(invoice.id, params.invoiceId))
          .returning();

        return {
          sender: updated.senderSnapshot,
          recipient: updated.recipientSnapshot,
        };
      })
  );
}
