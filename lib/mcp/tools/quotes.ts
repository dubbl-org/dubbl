import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { quote, invoice, invoiceLine, contact, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
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
}
