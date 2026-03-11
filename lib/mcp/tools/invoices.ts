import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoice, invoiceLine } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

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
      dueDate: z.string().describe("Due date (YYYY-MM-DD)"),
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
          })
        )
        .min(1)
        .describe("Invoice line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        await assertNotLocked(ctx.organizationId, params.issueDate);

        const invoiceNumber = await getNextNumber(
          ctx.organizationId,
          "invoice",
          "invoice_number",
          "INV"
        );

        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const amount = decimalToCents(l.quantity * l.unitPrice);
          subtotal += amount;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: decimalToCents(l.unitPrice),
            accountId: l.accountId ?? null,
            taxRateId: l.taxRateId ?? null,
            taxAmount: 0,
            amount,
            sortOrder: i,
          };
        });

        const total = subtotal;

        const [created] = await db
          .insert(invoice)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            invoiceNumber,
            issueDate: params.issueDate,
            dueDate: params.dueDate,
            reference: params.reference ?? null,
            notes: params.notes ?? null,
            subtotal,
            taxTotal: 0,
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
}
