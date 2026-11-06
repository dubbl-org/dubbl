import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { applyContactDefaults, fillSalesAccounts, loadContactDefaults } from "@/lib/api/contact-defaults";
import { resolveTermsDays } from "@/lib/payment-terms";
import { recordInvoicePayment } from "@/lib/api/invoice-payment";
import { voidInvoice } from "@/lib/api/invoice-void";
import { postDraftInvoice } from "@/lib/api/invoice-send";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoice, invoiceLine, invoiceSignature, emailConfig, organization, contact } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToMinorUnits } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { assertLineStockRefs } from "@/lib/api/line-stock-refs";
import { wrapTool } from "@/lib/mcp/errors";
import { checkMonthlyLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { sendEmail } from "@/lib/email/smtp-client";
import { randomBytes } from "crypto";
import type { AuthContext } from "@/lib/api/auth-context";
import { emitInvoiceCreated } from "@/lib/webhooks/events";
import { checkInvoiceCompliance } from "@/lib/documents/compliance";
import { submitForApproval, approveEntity, rejectEntity } from "@/lib/approvals/entities";

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
    "Create a new invoice with line items. Unit prices are decimal numbers (e.g. 12.50 for $12.50). Quantities are decimal numbers. The system calculates totals and assigns an invoice number automatically. Lines without accountId get the customer's default income account, lines that omit taxRateId get the customer's default tax rate, and a customer marked 'Don't charge tax' gets no tax on any line (Contacts > Bookkeeping).",
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
      invoiceType: z
        .enum(["standard", "deposit", "retainer"])
        .optional()
        .default("standard")
        .describe(
          "Invoice flavour. 'deposit'/'retainer' are normal AR invoices flagged as an upfront request (no special GL); defaults to 'standard'."
        ),
      depositPercent: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .optional()
        .describe(
          "For deposit/retainer invoices: the deposit percentage in basis points (e.g. 2500 = 25%). Optional."
        ),
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
            inventoryItemId: z
              .string()
              .optional()
              .describe(
                "Inventory item UUID. When set, selling this line will relieve stock and post COGS for the item when the invoice is posted/sent."
              ),
            warehouseId: z
              .string()
              .optional()
              .describe(
                "Warehouse UUID to draw the inventory from (only meaningful with inventoryItemId)."
              ),
            projectId: z
              .string()
              .optional()
              .describe("Project UUID for job-costing this line."),
          })
        )
        .min(1)
        .describe("Invoice line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");
        await assertLineStockRefs(ctx.organizationId, params.lines);

        await assertNotLocked(ctx.organizationId, params.issueDate);
        await checkMonthlyLimit(ctx.organizationId, invoice, invoice.organizationId, invoice.createdAt, "invoicesPerMonth", invoice.deletedAt);

        // The customer's defaults: income account and tax rate for lines that
        // don't set one, and no tax at all if they're marked "Don't charge tax".
        params.lines = await fillSalesAccounts(ctx.organizationId, applyContactDefaults(
          params.lines,
          await loadContactDefaults(ctx.organizationId, params.contactId),
          "sales"
        ));
        await checkMultiCurrency(ctx.organizationId, params.currencyCode);

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
            termsDays = resolveTermsDays(null, org?.defaultPaymentTerms);
          }
          const d = new Date(params.issueDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + (termsDays ?? 30));
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
          const grossAmount = decimalToMinorUnits(l.quantity * l.unitPrice, params.currencyCode);
          const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
          const amount = grossAmount - discountAmount;
          subtotal += amount;
          const taxRateId = l.taxRateId ?? null;
          const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: decimalToMinorUnits(l.unitPrice, params.currencyCode),
            accountId: l.accountId ?? null,
            taxRateId,
            discountPercent: l.discountPercent,
            taxAmount,
            amount,
            inventoryItemId: l.inventoryItemId ?? null,
            warehouseId: l.warehouseId ?? null,
            projectId: l.projectId ?? null,
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
            invoiceType: params.invoiceType,
            depositPercent: params.depositPercent ?? null,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(invoiceLine).values(
          processedLines.map((l) => ({
            invoiceId: created.id,
            ...l,
          }))
        );

        emitInvoiceCreated(ctx.organizationId, [created.id]);
        return { invoice: created };
      })
  );

  server.tool(
    "send_invoice",
    "Send (issue) a draft invoice without emailing it. Posts the sale to the ledger on the invoice's issue date (DR Accounts Receivable / CR the line income accounts and output tax), relieves stock and posts cost of goods sold for stock lines, records the sender and recipient details, and sets status to 'sent' so it can be paid and shows to the customer in the portal. Only drafts can be sent; an invoice waiting for approval must be approved first. Fails if the issue date is in a locked period or a foreign-currency invoice has no exchange rate. Returns the sent invoice.",
    {
      invoiceId: z.string().describe("The UUID of the draft invoice to send"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:invoices");
        const { invoice: sent } = await postDraftInvoice(ctx, params.invoiceId);
        return { invoice: sent };
      })
  );

  server.tool(
    "void_invoice",
    "Void an invoice. Reverses its posted sale entry (revenue, output tax and Accounts Receivable) on the invoice date and restocks any stock lines (reversing cost of goods sold); a draft is simply marked void. Refuses invoices with payments or applied credit notes/prepayments (delete or unapply those first) and invoices with a revenue schedule in progress (cancel it first). Fails if the invoice date is in a locked period. Returns the voided invoice.",
    {
      invoiceId: z
        .string()
        .describe("The UUID of the invoice to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:invoices");
        const { invoice: updated } = await voidInvoice(ctx, params.invoiceId);
        return { invoice: updated };
      })
  );

  server.tool(
    "pay_invoice",
    "Record money received against an invoice. Amount is in integer cents (e.g. 1250 = $12.50), in the invoice's currency, and must not exceed the invoice's amountDue. The invoice must be approved and sent (not draft, void, pending_approval or rejected). Atomically creates the payment record and its allocation, posts the journal entry (DR the bank account's ledger account / CR Accounts Receivable, with realised FX for a foreign-currency invoice) and updates the invoice to 'paid' or 'partial'. Pass bankAccountId to record which bank account the money went into (it must be in the invoice's currency or the base currency); omit it to use the default bank account (1100). Fails if the date is in a locked period. Returns the updated invoice and the payment.",
    {
      invoiceId: z.string().describe("The UUID of the invoice"),
      amount: z
        .number()
        .int()
        .min(1)
        .describe("Payment amount in integer cents, in the invoice's currency"),
      date: z
        .string()
        .optional()
        .describe("Payment date (YYYY-MM-DD); defaults to today. The journal entry posts on this date"),
      method: z
        .enum(["bank_transfer", "cash", "check", "card", "other"])
        .optional()
        .default("bank_transfer")
        .describe("How the money was received (defaults to bank_transfer)"),
      reference: z
        .string()
        .nullable()
        .optional()
        .describe("External reference (check number, transfer ref, etc.)"),
      bankAccountId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("UUID of the bank account (from list_bank_accounts) the money went into. Omit for the default bank account (ledger account 1100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");

        const { invoice: updated, payment } = await recordInvoicePayment(ctx, {
          invoiceId: params.invoiceId,
          amount: params.amount,
          date: params.date || new Date().toISOString().split("T")[0],
          method: params.method,
          reference: params.reference,
          bankAccountId: params.bankAccountId,
        });

        // payment.received (and invoice.paid when settled) are sent by the helper.
        return { invoice: updated, payment };
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
    "Check an invoice for compliance warnings based on the organization's country. Validates jurisdiction-specific requirements for EU (27 countries), UK, DE, FR, IN, SG, SA, JP, BR, AU, NZ, CA, and US. Returns an array of warnings with field, message, and severity (error/warning). Does not block invoice creation.",
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
        let contactCountryCode: string | null = null;
        if (contactAddresses) {
          const billing = contactAddresses.billing || Object.values(contactAddresses)[0];
          if (billing) {
            contactAddress = [billing.line1, billing.line2, billing.city, billing.state, billing.postalCode, billing.country]
              .filter(Boolean)
              .join(", ");
            contactCountryCode = billing.country || null;
          }
        }

        const typedLines = (inv.lines || []).map((l) => ({
          description: l.description || null,
          quantity: l.quantity ?? null,
          unitPrice: l.unitPrice ?? null,
          taxAmount: l.taxAmount ?? null,
        }));

        const warnings = checkInvoiceCompliance(
          {
            name: org?.name || null,
            address: orgAddress || null,
            taxId: org?.taxId || null,
            countryCode: org?.countryCode || null,
            addressStreet: org?.addressStreet || null,
            addressCity: org?.addressCity || null,
            addressPostalCode: org?.addressPostalCode || null,
            addressCountry: org?.addressCountry || null,
            businessRegistrationNumber: org?.businessRegistrationNumber || null,
          },
          {
            name: inv.contact?.name || null,
            address: contactAddress,
            taxNumber: inv.contact?.taxNumber || null,
            countryCode: contactCountryCode,
          },
          {
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            currencyCode: inv.currencyCode,
            notes: inv.notes,
            lines: typedLines,
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

  server.tool(
    "submit_invoice_for_approval",
    "Submit a draft invoice into the approval workflow. Requires an active approval workflow (with steps) whose conditions match the invoice; fails if none applies. When several workflows match, the one with the most conditions wins, then the oldest. Creates an approval request that tracks each step and moves the invoice to 'pending_approval' so it can't be sent until approved. Only draft invoices can be submitted. Returns the invoice and the approval request.",
    {
      invoiceId: z.string().describe("The UUID of the invoice to submit for approval"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await submitForApproval(ctx, "invoice", params.invoiceId);
        return { invoice: outcome.entity, approvalRequest: outcome.request };
      })
  );

  server.tool(
    "approve_invoice",
    "Approve an invoice that is pending approval (requires approve:invoices). Records the approval on the open approval request; only the current step's approver can act. Returns the invoice to 'draft' (cleared to send) once the last step approves; if more steps remain the invoice stays pending_approval. Returns the invoice, the request and finalized (true once fully approved).",
    {
      invoiceId: z.string().describe("The UUID of the invoice to approve"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment recorded with the approval action"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await approveEntity(ctx, "invoice", params.invoiceId, params.comment);
        return { invoice: outcome.entity, request: outcome.request, finalized: outcome.finalized };
      })
  );

  server.tool(
    "reject_invoice",
    "Reject an invoice that is pending approval (requires approve:invoices; only the current step's approver can act). Records the rejection on the open approval request (a reject at any step rejects the whole request) and moves the invoice to 'rejected'. Returns the invoice and the request.",
    {
      invoiceId: z.string().describe("The UUID of the invoice to reject"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason explaining the rejection"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await rejectEntity(ctx, "invoice", params.invoiceId, params.reason);
        return { invoice: outcome.entity, request: outcome.request };
      })
  );
}
