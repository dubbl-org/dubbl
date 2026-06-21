import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  quote,
  quoteLine,
  invoice,
  invoiceLine,
  contact,
  organization,
  inventoryItem,
} from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { resolvePrice } from "@/lib/api/pricing";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerQuoteTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "convert_quote_to_invoice",
    [
      "Convert an accepted quote into an invoice, with progress/milestone billing support.",
      "All amounts returned are in integer cents.",
      "By default (no percentage and no lines) the FULL remaining un-billed balance is invoiced.",
      "Pass `percentage` (1-100) to bill that share of the quote total this round, OR",
      "pass `lines` with per-quote-line quantities (whole units, e.g. 1.5) for milestone billing.",
      "`lines` takes precedence over `percentage`. Each call increments the quote's billedTotal.",
      "The quote becomes 'converted' once fully billed; partial billing leaves it 'accepted' so",
      "further progress invoices can be raised. Over-billing past the quote total is rejected.",
      "Returns the updated quote, the created invoice, and a billing summary",
      "{ invoiced, billedTotal, remaining, fullyBilled } in cents.",
    ].join(" "),
    {
      quoteId: z.string().describe("UUID of the accepted quote to convert"),
      percentage: z
        .number()
        .gt(0)
        .max(100)
        .optional()
        .describe(
          "Percentage (1-100) of the quote TOTAL to bill this round. Omit to bill the full remaining balance."
        ),
      lines: z
        .array(
          z.object({
            quoteLineId: z.string().describe("UUID of the quote line to bill"),
            quantity: z
              .number()
              .gt(0)
              .describe("Quantity to bill in whole units (e.g. 1.5 = one and a half)"),
          })
        )
        .optional()
        .describe(
          "Per-line quantities for milestone billing. Takes precedence over percentage when supplied."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const found = await db.query.quote.findFirst({
          where: and(
            eq(quote.id, params.quoteId),
            eq(quote.organizationId, ctx.organizationId),
            notDeleted(quote.deletedAt)
          ),
          with: { lines: true },
        });

        if (!found) throw new Error("Quote not found");
        if (found.status !== "accepted") {
          throw new Error("Only accepted quotes can be converted to invoices");
        }

        const alreadyBilled = found.billedTotal ?? 0;
        const remaining = found.total - alreadyBilled;
        if (remaining <= 0) throw new Error("Quote is already fully billed");

        const quoteLines = [...found.lines].sort((a, b) => a.sortOrder - b.sortOrder);

        type InvLine = {
          description: string;
          quantity: number;
          unitPrice: number;
          accountId: string | null;
          taxRateId: string | null;
          discountPercent: number;
          taxAmount: number;
          amount: number;
          costCenterId: string | null;
          sortOrder: number;
        };

        let billLines: InvLine[] = [];

        if (params.lines && params.lines.length > 0) {
          const byId = new Map(quoteLines.map((l) => [l.id, l]));
          for (const sel of params.lines) {
            if (!byId.get(sel.quoteLineId)) {
              throw new Error(`Quote line ${sel.quoteLineId} not found on this quote`);
            }
          }
          billLines = params.lines.map((sel, i) => {
            const ql = byId.get(sel.quoteLineId)!;
            const billQty = Math.round(sel.quantity * 100);
            const gross = Math.round((ql.unitPrice * billQty) / 100);
            const discount = ql.discountPercent
              ? Math.round((gross * ql.discountPercent) / 10000)
              : 0;
            const amount = gross - discount;
            const taxAmount =
              ql.amount > 0 ? Math.round((ql.taxAmount * amount) / ql.amount) : 0;
            return {
              description: ql.description,
              quantity: billQty,
              unitPrice: ql.unitPrice,
              accountId: ql.accountId,
              taxRateId: ql.taxRateId,
              discountPercent: ql.discountPercent,
              taxAmount,
              amount,
              costCenterId: ql.costCenterId,
              sortOrder: i,
            };
          });
        } else if (params.percentage != null) {
          const factor = params.percentage / 100;
          billLines = quoteLines.map((ql, i) => ({
            description: ql.description,
            quantity: Math.round(ql.quantity * factor),
            unitPrice: ql.unitPrice,
            accountId: ql.accountId,
            taxRateId: ql.taxRateId,
            discountPercent: ql.discountPercent,
            taxAmount: Math.round(ql.taxAmount * factor),
            amount: Math.round(ql.amount * factor),
            costCenterId: ql.costCenterId,
            sortOrder: i,
          }));
        } else if (alreadyBilled === 0) {
          billLines = quoteLines.map((ql, i) => ({
            description: ql.description,
            quantity: ql.quantity,
            unitPrice: ql.unitPrice,
            accountId: ql.accountId,
            taxRateId: ql.taxRateId,
            discountPercent: ql.discountPercent,
            taxAmount: ql.taxAmount,
            amount: ql.amount,
            costCenterId: ql.costCenterId,
            sortOrder: i,
          }));
        } else {
          const factor = found.total > 0 ? remaining / found.total : 0;
          billLines = quoteLines.map((ql, i) => ({
            description: ql.description,
            quantity: Math.round(ql.quantity * factor),
            unitPrice: ql.unitPrice,
            accountId: ql.accountId,
            taxRateId: ql.taxRateId,
            discountPercent: ql.discountPercent,
            taxAmount: Math.round(ql.taxAmount * factor),
            amount: Math.round(ql.amount * factor),
            costCenterId: ql.costCenterId,
            sortOrder: i,
          }));
        }

        const subtotal = billLines.reduce((s, l) => s + l.amount, 0);
        const taxTotal = billLines.reduce((s, l) => s + l.taxAmount, 0);
        const invoiceTotal = subtotal + taxTotal;

        if (invoiceTotal <= 0) {
          throw new Error("Nothing to bill: requested portion totals zero");
        }
        if (invoiceTotal > remaining) {
          throw new Error(
            `Requested amount (${invoiceTotal}) exceeds the un-billed balance (${remaining})`
          );
        }

        const invoiceNumber = await getNextNumber(
          ctx.organizationId,
          "invoice",
          "invoice_number",
          "INV"
        );

        const today = new Date().toISOString().split("T")[0];
        const contactRecord = await db.query.contact.findFirst({
          where: eq(contact.id, found.contactId),
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
        const dueDateObj = new Date(today + "T00:00:00Z");
        dueDateObj.setUTCDate(dueDateObj.getUTCDate() + (termsDays || 30));
        const dueDate = dueDateObj.toISOString().split("T")[0];

        const newBilledTotal = alreadyBilled + invoiceTotal;
        const fullyBilled = newBilledTotal >= found.total - 1;

        const result = await db.transaction(async (tx) => {
          const [createdInvoice] = await tx
            .insert(invoice)
            .values({
              organizationId: ctx.organizationId,
              contactId: found.contactId,
              invoiceNumber,
              issueDate: today,
              dueDate,
              reference: found.reference,
              notes: found.notes,
              subtotal,
              taxTotal,
              total: invoiceTotal,
              amountPaid: 0,
              amountDue: invoiceTotal,
              currencyCode: found.currencyCode,
              createdBy: ctx.userId,
            })
            .returning();

          const linesToInsert = billLines.filter(
            (l) => l.amount !== 0 || l.taxAmount !== 0
          );
          if (linesToInsert.length > 0) {
            await tx.insert(invoiceLine).values(
              linesToInsert.map((l) => ({
                invoiceId: createdInvoice.id,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                accountId: l.accountId,
                taxRateId: l.taxRateId,
                discountPercent: l.discountPercent,
                taxAmount: l.taxAmount,
                amount: l.amount,
                costCenterId: l.costCenterId,
                sortOrder: l.sortOrder,
              }))
            );
          }

          const [updatedQuote] = await tx
            .update(quote)
            .set({
              billedTotal: newBilledTotal,
              status: fullyBilled ? "converted" : "accepted",
              convertedInvoiceId: createdInvoice.id,
              updatedAt: new Date(),
            })
            .where(eq(quote.id, params.quoteId))
            .returning();

          return { createdInvoice, updatedQuote };
        });

        return {
          quote: result.updatedQuote,
          invoice: result.createdInvoice,
          billing: {
            invoiced: invoiceTotal,
            billedTotal: newBilledTotal,
            remaining: found.total - newBilledTotal,
            fullyBilled,
          },
        };
      })
  );

  server.tool(
    "list_quotes",
    "List sales quotes/estimates with an optional status filter and pagination. Amounts (subtotal, taxTotal, total, billedTotal) are in integer cents. Returns the quotes (each with its contact) and the total count.",
    {
      status: z
        .enum(["draft", "sent", "accepted", "declined", "expired", "converted"])
        .optional()
        .describe("Filter by quote status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of quotes to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(quote.organizationId, ctx.organizationId),
          notDeleted(quote.deletedAt),
        ];
        if (params.status) conditions.push(eq(quote.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const quotes = await db.query.quote.findMany({
          where: and(...conditions),
          orderBy: desc(quote.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(quote)
          .where(and(...conditions));

        return { quotes, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_quote",
    "Get a single sales quote/estimate by ID, including its line items (each with account and tax rate) and the customer contact. All amounts are in integer cents; quantity is stored as units x 100 (1.00 = 100) and discountPercent is in basis points (1000 = 10%).",
    {
      quoteId: z.string().describe("The UUID of the quote"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.quote.findFirst({
          where: and(
            eq(quote.id, params.quoteId),
            eq(quote.organizationId, ctx.organizationId),
            notDeleted(quote.deletedAt)
          ),
          with: {
            contact: true,
            lines: { with: { account: true, taxRate: true } },
          },
        });
        if (!found) throw new Error("Quote not found");
        return { quote: found };
      })
  );

  server.tool(
    "create_quote",
    "Create a draft sales quote/estimate with line items. unitPrice is in integer cents (e.g. 1250 = $12.50) and is stored directly; quantity is a decimal number of units (e.g. 1.5). discountPercent is in basis points (1000 = 10%). Lines are tax-EXCLUSIVE — tax is added on top per line via the line's taxRateId. For an inventory-item line you may omit unitPrice to resolve the price from the line/document price list (falling back to the item's default sale price); an explicit unitPrice always wins. The system computes subtotal/tax/total and assigns a quote number (QTE). Returns the created quote.",
    {
      contactId: z.string().describe("Customer contact UUID"),
      issueDate: z.string().describe("Issue date (YYYY-MM-DD)"),
      expiryDate: z.string().describe("Expiry date (YYYY-MM-DD)"),
      reference: z.string().optional().describe("External reference"),
      notes: z.string().optional().describe("Notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code (defaults to USD)"),
      priceListId: z
        .string()
        .optional()
        .describe(
          "Default price list applied to inventory-item lines that don't carry their own priceListId"
        ),
      lines: z
        .array(
          z.object({
            description: z.string().min(1).describe("Line item description"),
            quantity: z
              .number()
              .optional()
              .default(1)
              .describe("Quantity in units (decimal, e.g. 1.5)"),
            unitPrice: z
              .number()
              .int()
              .optional()
              .describe(
                "Unit price in integer cents (e.g. 1250 = $12.50); stored directly. Omit for an inventory-item line to resolve from the price list / item default sale price"
              ),
            accountId: z.string().optional().describe("Income/account UUID for this line"),
            taxRateId: z.string().optional().describe("Tax rate UUID applied to this line"),
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
                "Inventory item this line prices (used only for default-price resolution; not persisted on the quote line)"
              ),
            priceListId: z
              .string()
              .optional()
              .describe("Per-line price list override; falls back to the document-level priceListId"),
          })
        )
        .min(1)
        .describe("Quote line items (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const quoteNumber = await getNextNumber(
          ctx.organizationId,
          "quote",
          "quote_number",
          "QTE"
        );

        const taxRateIds = params.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
        const ratesMap = await preloadTaxRates(taxRateIds);

        // Preload default sale prices for inventory-item lines that don't carry
        // an explicit unitPrice (mirrors the REST route).
        const itemIds = [
          ...new Set(
            params.lines
              .filter((l) => l.inventoryItemId && l.unitPrice === undefined)
              .map((l) => l.inventoryItemId as string)
          ),
        ];
        const itemPriceMap = new Map<string, number>();
        if (itemIds.length > 0) {
          const items = await db.query.inventoryItem.findMany({
            where: and(
              eq(inventoryItem.organizationId, ctx.organizationId),
              inArray(inventoryItem.id, itemIds)
            ),
            columns: { id: true, salePrice: true },
          });
          for (const it of items) itemPriceMap.set(it.id, it.salePrice);
        }

        // unitPriceCents per line, in the same order as params.lines. Unlike the
        // REST route, the unitPrice we receive is already integer cents and is
        // stored directly (no decimalToMinorUnits conversion).
        const unitPricesCents = await Promise.all(
          params.lines.map(async (l) => {
            if (l.unitPrice !== undefined) return l.unitPrice;
            if (l.inventoryItemId) {
              const listId = l.priceListId || params.priceListId || null;
              if (listId) {
                const resolved = await resolvePrice(
                  ctx.organizationId,
                  l.inventoryItemId,
                  listId,
                  l.quantity || 1,
                  params.issueDate
                );
                if (resolved) return resolved.unitPrice;
              }
              return itemPriceMap.get(l.inventoryItemId) ?? 0;
            }
            return 0;
          })
        );

        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const unitPriceCents = unitPricesCents[i];
          const grossAmount = Math.round(l.quantity * unitPriceCents);
          const discountAmount = l.discountPercent
            ? Math.round((grossAmount * l.discountPercent) / 10000)
            : 0;
          const amount = grossAmount - discountAmount;
          subtotal += amount;
          const taxRateId = l.taxRateId || null;
          const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: unitPriceCents,
            accountId: l.accountId || null,
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
          .insert(quote)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            quoteNumber,
            issueDate: params.issueDate,
            expiryDate: params.expiryDate,
            reference: params.reference || null,
            notes: params.notes || null,
            subtotal,
            taxTotal,
            total,
            currencyCode: params.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(quoteLine).values(
          processedLines.map((l) => ({
            quoteId: created.id,
            ...l,
          }))
        );

        return { quote: created };
      })
  );

  server.tool(
    "update_quote",
    "Update a draft sales quote/estimate's header fields (e.g. issueDate, expiryDate, reference, notes, currencyCode, contactId). Only DRAFT quotes can be edited. This mirrors the REST PATCH: it patches the supplied header fields directly and does NOT recalculate line items or totals — to change lines, recreate the quote. Returns the updated quote.",
    {
      quoteId: z.string().describe("The UUID of the quote to update"),
      contactId: z.string().optional().describe("Customer contact UUID"),
      issueDate: z.string().optional().describe("Issue date (YYYY-MM-DD)"),
      expiryDate: z.string().optional().describe("Expiry date (YYYY-MM-DD)"),
      reference: z.string().nullable().optional().describe("External reference"),
      notes: z.string().nullable().optional().describe("Notes"),
      currencyCode: z.string().optional().describe("Currency code"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const existing = await db.query.quote.findFirst({
          where: and(
            eq(quote.id, params.quoteId),
            eq(quote.organizationId, ctx.organizationId),
            notDeleted(quote.deletedAt)
          ),
        });
        if (!existing) throw new Error("Quote not found");
        if (existing.status !== "draft") {
          throw new Error("Only draft quotes can be edited");
        }

        const { quoteId, ...fields } = params;
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) patch[key] = value;
        }

        const [updated] = await db
          .update(quote)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(quote.id, quoteId))
          .returning();

        return { quote: updated };
      })
  );

  server.tool(
    "send_quote",
    "Mark a draft sales quote/estimate as sent. Only DRAFT quotes can be sent. Flips status to 'sent' and stamps sentAt. (This does NOT send an email; it records the send.) Returns the updated quote.",
    {
      quoteId: z.string().describe("The UUID of the quote to send"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const found = await db.query.quote.findFirst({
          where: and(
            eq(quote.id, params.quoteId),
            eq(quote.organizationId, ctx.organizationId),
            notDeleted(quote.deletedAt)
          ),
        });
        if (!found) throw new Error("Quote not found");
        if (found.status !== "draft") {
          throw new Error("Only draft quotes can be sent");
        }

        const [updated] = await db
          .update(quote)
          .set({
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(quote.id, params.quoteId))
          .returning();

        return { quote: updated };
      })
  );

  server.tool(
    "accept_quote",
    "Mark a sent sales quote/estimate as accepted by the customer. Only 'sent' quotes can be accepted, and the quote must not have expired (its expiryDate must be today or later). Flips status to 'accepted'. Returns the updated quote.",
    {
      quoteId: z.string().describe("The UUID of the quote to accept"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const found = await db.query.quote.findFirst({
          where: and(
            eq(quote.id, params.quoteId),
            eq(quote.organizationId, ctx.organizationId),
            notDeleted(quote.deletedAt)
          ),
        });
        if (!found) throw new Error("Quote not found");
        if (found.status !== "sent") {
          throw new Error("Only sent quotes can be accepted");
        }

        const today = new Date().toISOString().split("T")[0];
        if (found.expiryDate < today) {
          throw new Error("This quote has expired");
        }

        const [updated] = await db
          .update(quote)
          .set({
            status: "accepted",
            updatedAt: new Date(),
          })
          .where(eq(quote.id, params.quoteId))
          .returning();

        return { quote: updated };
      })
  );

  server.tool(
    "decline_quote",
    "Mark a sent sales quote/estimate as declined by the customer. Only 'sent' quotes can be declined. Flips status to 'declined'. Returns the updated quote.",
    {
      quoteId: z.string().describe("The UUID of the quote to decline"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const found = await db.query.quote.findFirst({
          where: and(
            eq(quote.id, params.quoteId),
            eq(quote.organizationId, ctx.organizationId),
            notDeleted(quote.deletedAt)
          ),
        });
        if (!found) throw new Error("Quote not found");
        if (found.status !== "sent") {
          throw new Error("Only sent quotes can be declined");
        }

        const [updated] = await db
          .update(quote)
          .set({
            status: "declined",
            updatedAt: new Date(),
          })
          .where(eq(quote.id, params.quoteId))
          .returning();

        return { quote: updated };
      })
  );
}
