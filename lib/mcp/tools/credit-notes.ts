import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  creditNote,
  creditNoteLine,
  invoice,
  payment,
  paymentAllocation,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { getNextEntryNumber, createCogsJournalEntry } from "@/lib/api/journal-automation";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for customer credit notes (AR / sales credit notes). A credit note
 * records a credit owed back to a customer (e.g. a return or overcharge) and can
 * be applied against the customer's invoices to reduce what they owe.
 *
 * IMPORTANT money convention: unlike the REST route (which receives unitPrice in
 * dollars and multiplies by 100), these MCP tools ACCEPT unit prices as integer
 * minor units (cents) and store them directly. quantity is a decimal number.
 * discountPercent is in basis points (1000 = 10%). All amounts in RESULTS are
 * integer cents. Direct DB access via Drizzle (no HTTP self-calls); org-scoped
 * via the AuthContext.
 *
 * NOTE: sending a credit note (which posts the GL issue entry) is handled by the
 * separate `send_credit_note` tool — not duplicated here.
 */
export function registerCreditNoteTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_credit_notes",
    "List customer credit notes (AR / sales credit notes) with optional filters and pagination. Amounts (subtotal, taxTotal, total, amountApplied, amountRemaining) are in integer cents.",
    {
      status: z
        .enum(["draft", "sent", "applied", "void"])
        .optional()
        .describe("Filter by credit-note status"),
      contactId: z.string().optional().describe("Filter by customer contact UUID"),
      startDate: z
        .string()
        .optional()
        .describe("Filter by issue date from (YYYY-MM-DD), inclusive"),
      endDate: z
        .string()
        .optional()
        .describe("Filter by issue date to (YYYY-MM-DD), inclusive"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of credit notes to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(creditNote.organizationId, ctx.organizationId),
          notDeleted(creditNote.deletedAt),
        ];
        if (params.status) conditions.push(eq(creditNote.status, params.status));
        if (params.contactId) conditions.push(eq(creditNote.contactId, params.contactId));
        if (params.startDate) conditions.push(gte(creditNote.issueDate, params.startDate));
        if (params.endDate) conditions.push(lte(creditNote.issueDate, params.endDate));

        const offset = (params.page - 1) * params.limit;
        const creditNotes = await db.query.creditNote.findMany({
          where: and(...conditions),
          orderBy: desc(creditNote.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(creditNote)
          .where(and(...conditions));

        return {
          creditNotes,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_credit_note",
    "Get a single customer credit note by ID, including its line items (with account and tax rate) and customer contact. All amounts are in integer cents.",
    {
      creditNoteId: z.string().describe("The UUID of the credit note"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.creditNote.findFirst({
          where: and(
            eq(creditNote.id, params.creditNoteId),
            eq(creditNote.organizationId, ctx.organizationId),
            notDeleted(creditNote.deletedAt)
          ),
          with: {
            contact: true,
            lines: { with: { account: true, taxRate: true } },
          },
        });
        if (!found) throw new Error("Credit note not found");
        return { creditNote: found };
      })
  );

  server.tool(
    "create_credit_note",
    "Create a draft customer credit note (AR / sales credit note) with line items. unitPrice is in integer cents (e.g. 1250 = $12.50) and is stored directly; quantity is a decimal number (e.g. 1.5). discountPercent is in basis points (1000 = 10%). Lines are tax-EXCLUSIVE — tax is added on top per line. The system computes subtotal/tax/total and assigns a credit-note number (CN). Optionally link the original invoice via invoiceId. Returns the created credit note.",
    {
      contactId: z.string().describe("Customer contact UUID"),
      invoiceId: z
        .string()
        .optional()
        .describe("UUID of the original invoice this credit relates to (optional)"),
      issueDate: z.string().describe("Issue date (YYYY-MM-DD)"),
      reference: z.string().optional().describe("External reference"),
      notes: z.string().optional().describe("Notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code (defaults to USD)"),
      lines: z
        .array(
          z.object({
            description: z.string().min(1).describe("Line item description"),
            quantity: z
              .number()
              .optional()
              .default(1)
              .describe("Quantity (decimal, e.g. 1.5)"),
            unitPrice: z
              .number()
              .int()
              .optional()
              .default(0)
              .describe("Unit price in integer cents (e.g. 1250 = $12.50); stored directly"),
            accountId: z.string().optional().describe("Revenue/account UUID for this line"),
            taxRateId: z.string().optional().describe("Tax rate UUID"),
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
        .describe("Credit-note line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:credit-notes");
        await assertNotLocked(ctx.organizationId, params.issueDate);

        const creditNoteNumber = await getNextNumber(
          ctx.organizationId,
          "credit_note",
          "credit_note_number",
          "CN"
        );

        const taxRateIds = params.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
        const ratesMap = await preloadTaxRates(taxRateIds);

        // Mirror the REST route's storage/tax math, but on the integer-cents
        // unitPrice we receive (do NOT multiply by 100): grossAmount = quantity
        // * unitPrice (both already in their stored units — cents for price),
        // less the basis-point discount, then tax on top.
        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const grossAmount = Math.round(l.quantity * l.unitPrice);
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
            unitPrice: l.unitPrice,
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
          .insert(creditNote)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            invoiceId: params.invoiceId || null,
            creditNoteNumber,
            issueDate: params.issueDate,
            reference: params.reference || null,
            notes: params.notes || null,
            subtotal,
            taxTotal,
            total,
            amountApplied: 0,
            amountRemaining: 0,
            currencyCode: params.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(creditNoteLine).values(
          processedLines.map((l) => ({
            creditNoteId: created.id,
            ...l,
          }))
        );

        return { creditNote: created };
      })
  );

  server.tool(
    "apply_credit_note",
    "Apply a customer credit note's credit against an invoice, reducing what the customer owes. amount is in integer cents and must not exceed the credit note's remaining balance or the invoice's outstanding amount due. The credit note must be 'sent' (not draft/applied/void). The invoice must belong to the same customer and currency, and not be draft/void. This is a pure open-item OFFSET — no journal entry is posted (AR was already relieved when the credit note was sent); it records a carrier payment + allocations, increments the credit note's amountApplied (marking it 'applied' when fully used), and updates the invoice's amountPaid/amountDue and status ('paid' or 'partial'). Returns the updated credit note and invoice.",
    {
      creditNoteId: z.string().describe("The UUID of the credit note to apply"),
      invoiceId: z.string().describe("The UUID of the invoice to apply the credit to"),
      amount: z
        .number()
        .int()
        .min(1)
        .describe("Amount to apply, in integer cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:credit-notes");

        const found = await db.query.creditNote.findFirst({
          where: and(
            eq(creditNote.id, params.creditNoteId),
            eq(creditNote.organizationId, ctx.organizationId),
            notDeleted(creditNote.deletedAt)
          ),
        });
        if (!found) throw new Error("Credit note not found");
        if (found.status !== "sent") {
          throw new Error("Only sent credit notes can be applied");
        }
        if (params.amount > found.amountRemaining) {
          throw new Error("Amount exceeds credit note remaining balance");
        }

        const foundInvoice = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        if (!foundInvoice) throw new Error("Invoice not found");
        if (foundInvoice.status === "draft" || foundInvoice.status === "void") {
          throw new Error("Cannot apply credit to this invoice status");
        }
        // The credit note belongs to one customer — applying it to another
        // customer's invoice would corrupt both customers' balances and statements.
        if (foundInvoice.contactId !== found.contactId) {
          throw new Error(
            "This credit note belongs to a different customer than the invoice."
          );
        }
        // The amounts are offset 1:1, so a currency mismatch would reduce the
        // invoice by the wrong figure and break the tie between AR and the GL.
        if (foundInvoice.currencyCode !== found.currencyCode) {
          throw new Error(
            "The credit note and invoice are in different currencies. Apply a credit note in the same currency."
          );
        }
        if (params.amount > foundInvoice.amountDue) {
          throw new Error("Amount exceeds invoice amount due");
        }

        // Compute new credit-note balances/status
        const newAmountApplied = found.amountApplied + params.amount;
        const newAmountRemaining = found.amountRemaining - params.amount;
        const cnStatus = newAmountRemaining <= 0 ? "applied" : "sent";

        // Compute new invoice balances/status
        const newAmountPaid = foundInvoice.amountPaid + params.amount;
        const newAmountDue = foundInvoice.total - newAmountPaid;
        const invoiceStatus = newAmountDue <= 0 ? "paid" : "partial";

        // Generate a payment number so the allocation has a carrier row.
        const paymentNumber = await getNextNumber(
          ctx.organizationId,
          "payment",
          "payment_number",
          "PAY"
        );

        // NO journal entry is posted here. When the credit note was SENT it
        // already posted DR Revenue / DR Output VAT / CR Accounts Receivable —
        // AR was relieved once at issue. Applying it is a pure open-item OFFSET:
        // record the allocation + decrement balances + update statuses only.
        const { updatedCreditNote, updatedInvoice } = await db.transaction(
          async (tx) => {
            // Carrier payment row for the allocation. No bank movement, no
            // journal entry — AR was already relieved at issue, so this records
            // the offset only.
            const [createdPayment] = await tx
              .insert(payment)
              .values({
                organizationId: ctx.organizationId,
                contactId: found.contactId,
                paymentNumber,
                type: "received",
                date: found.issueDate,
                amount: params.amount,
                method: "other",
                reference: found.creditNoteNumber,
                notes: `Credit note ${found.creditNoteNumber} applied to invoice ${foundInvoice.invoiceNumber}`,
                currencyCode: found.currencyCode,
                createdBy: ctx.userId,
              })
              .returning();

            // Record the credit-note allocation linking credit note -> invoice.
            await tx.insert(paymentAllocation).values([
              {
                paymentId: createdPayment.id,
                documentType: "credit_note",
                documentId: params.creditNoteId,
                amount: params.amount,
              },
              {
                paymentId: createdPayment.id,
                documentType: "invoice",
                documentId: params.invoiceId,
                amount: params.amount,
              },
            ]);

            const [updatedCreditNote] = await tx
              .update(creditNote)
              .set({
                amountApplied: newAmountApplied,
                amountRemaining: Math.max(0, newAmountRemaining),
                status: cnStatus as (typeof creditNote.status.enumValues)[number],
                updatedAt: new Date(),
              })
              .where(eq(creditNote.id, params.creditNoteId))
              .returning();

            const [updatedInvoice] = await tx
              .update(invoice)
              .set({
                amountPaid: newAmountPaid,
                amountDue: Math.max(0, newAmountDue),
                status: invoiceStatus,
                paidAt: invoiceStatus === "paid" ? new Date() : null,
                updatedAt: new Date(),
              })
              .where(eq(invoice.id, params.invoiceId))
              .returning();

            return { updatedCreditNote, updatedInvoice };
          }
        );

        return { creditNote: updatedCreditNote, invoice: updatedInvoice };
      })
  );

  server.tool(
    "void_credit_note",
    "Void a customer credit note. Marks its status 'void' and stamps voidedAt. Fails if it is already voided. If the credit note was SENT (posted to the GL), this posts a reversing journal entry (DR AR / CR Revenue / CR Output VAT) dated the issue date, re-issues any restocked inventory that the send restocked (DR COGS / CR Inventory for the credited fraction), and requires the issue-date period to be open. It also unwinds every open-item application: restores each affected invoice's amountPaid/amountDue/status and removes the carrier payment(s) + their allocations. Finally resets the note's applied balance. Returns the updated credit note.",
    {
      creditNoteId: z.string().describe("The UUID of the credit note to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:credit-notes");

        const found = await db.query.creditNote.findFirst({
          where: and(
            eq(creditNote.id, params.creditNoteId),
            eq(creditNote.organizationId, ctx.organizationId),
            notDeleted(creditNote.deletedAt)
          ),
        });
        if (!found) throw new Error("Credit note not found");
        if (found.status === "void") throw new Error("Already voided");

        // A credit note only posts to the GL when it is SENT (status sent/applied
        // and a journalEntryId is stamped). A draft never posted, so voiding it is
        // a pure status flip — no reversal, no restock undo.
        const wasPosted =
          (found.status === "sent" || found.status === "applied") &&
          !!found.journalEntryId;

        // Don't let a void post reversing entries into a locked/closed period.
        if (wasPosted) {
          await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
        }

        const [updated] = await db.transaction(async (tx) => {
          if (wasPosted) {
            // 1) Reverse the issue posting. The send route booked
            //    DR Revenue / DR Output VAT / CR Accounts Receivable. Mirror
            //    those posted lines with debit/credit swapped so the pair nets
            //    to zero in base currency (DR AR / CR Revenue / CR Output VAT).
            const originalLines = await tx.query.journalLine.findMany({
              where: eq(journalLine.journalEntryId, found.journalEntryId as string),
            });
            if (originalLines.length > 0) {
              const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
              const [reversal] = await tx
                .insert(journalEntry)
                .values({
                  organizationId: ctx.organizationId,
                  entryNumber,
                  date: found.issueDate,
                  description: `Void credit note ${found.creditNoteNumber}`,
                  reference: found.creditNoteNumber,
                  status: "posted",
                  sourceType: "credit_note_void",
                  sourceId: found.id,
                  postedAt: new Date(),
                  createdBy: ctx.userId,
                })
                .returning();

              await tx.insert(journalLine).values(
                originalLines.map((l) => ({
                  journalEntryId: reversal.id,
                  accountId: l.accountId,
                  description: `Void credit note ${found.creditNoteNumber}`,
                  debitAmount: l.creditAmount,
                  creditAmount: l.debitAmount,
                  currencyCode: l.currencyCode,
                  exchangeRate: l.exchangeRate,
                  costCenterId: l.costCenterId,
                  projectId: l.projectId,
                }))
              );
            }

            // 2) Undo the restock the SEND performed. Sending a credit note for a
            //    linked invoice RESTOCKED the credited stock (reverse COGS:
            //    DR Inventory / CR COGS). Voiding the credit note must take that
            //    stock back out — i.e. RE-ISSUE it (DR COGS / CR Inventory) for
            //    the same credited fraction. Call createCogsJournalEntry WITHOUT
            //    reverse, mirroring exactly the send route's fraction logic so the
            //    quantities line up.
            if (found.invoiceId) {
              const original = await tx.query.invoice.findFirst({
                where: and(
                  eq(invoice.id, found.invoiceId),
                  eq(invoice.organizationId, ctx.organizationId)
                ),
                with: { lines: true },
              });
              const invStockLines =
                original?.lines.filter((l) => l.inventoryItemId) ?? [];
              if (original && invStockLines.length > 0) {
                const fraction =
                  original.total > 0 ? Math.min(found.total / original.total, 1) : 1;
                const reissueLines = invStockLines
                  .map((l) => ({
                    inventoryItemId: l.inventoryItemId as string,
                    quantity: Math.round(l.quantity * fraction),
                    warehouseId: l.warehouseId,
                  }))
                  .filter((l) => l.quantity > 0);
                if (reissueLines.length > 0) {
                  await createCogsJournalEntry(
                    { organizationId: ctx.organizationId, userId: ctx.userId },
                    {
                      reference: found.creditNoteNumber,
                      date: found.issueDate,
                      currencyCode: found.currencyCode,
                      lines: reissueLines,
                    },
                    tx
                    // no { reverse } → re-issue stock, undoing the send's restock
                  );
                }
              }
            }
          }

          // 3) Reverse any OPEN-ITEM application of this credit note. The apply
          //    flow does NOT post a journal entry — it relieved AR once at issue —
          //    so applying it only inserted a carrier `payment` row with two
          //    paymentAllocation rows (a `credit_note` allocation pointing to
          //    this note + an `invoice` allocation pointing to the settled
          //    invoice) and decremented the target invoice's amountDue / bumped
          //    amountPaid. Voiding must UNWIND that so balances tie out: restore
          //    every affected invoice's amountPaid/amountDue/status and remove the
          //    carrier payment(s) + their allocations. We key off the allocations
          //    (not amountApplied alone) so multiple partial applications across
          //    different invoices are all reversed.
          const cnAllocations = await tx.query.paymentAllocation.findMany({
            where: and(
              eq(paymentAllocation.documentType, "credit_note"),
              eq(paymentAllocation.documentId, params.creditNoteId)
            ),
          });

          if (cnAllocations.length > 0) {
            const carrierPaymentIds = [
              ...new Set(cnAllocations.map((a) => a.paymentId)),
            ];

            // The invoice-side allocations carried by the same payments tell us
            // how much to give back to each invoice.
            const invoiceAllocations = await tx.query.paymentAllocation.findMany({
              where: and(
                inArray(paymentAllocation.paymentId, carrierPaymentIds),
                eq(paymentAllocation.documentType, "invoice")
              ),
            });

            // Sum the credit applied per invoice across all carrier payments.
            const appliedByInvoice = new Map<string, number>();
            for (const a of invoiceAllocations) {
              appliedByInvoice.set(
                a.documentId,
                (appliedByInvoice.get(a.documentId) ?? 0) + a.amount
              );
            }

            for (const [invoiceId, applied] of appliedByInvoice) {
              if (applied <= 0) continue;
              const target = await tx.query.invoice.findFirst({
                where: and(
                  eq(invoice.id, invoiceId),
                  eq(invoice.organizationId, ctx.organizationId)
                ),
              });
              if (!target) continue;
              // Voided invoices were settled to zero; don't resurrect their balance.
              if (target.status === "void") continue;

              const restoredPaid = Math.max(0, target.amountPaid - applied);
              const restoredDue = target.total - restoredPaid;
              // If this credit note was the ONLY settlement, removing it leaves
              // the invoice with nothing paid, so it returns to 'sent' (not
              // 'partial').
              const restoredStatus =
                restoredPaid <= 0 ? "sent" : restoredDue <= 0 ? "paid" : "partial";

              await tx
                .update(invoice)
                .set({
                  amountPaid: restoredPaid,
                  amountDue: Math.max(0, restoredDue),
                  status: restoredStatus,
                  paidAt: restoredStatus === "paid" ? target.paidAt : null,
                  updatedAt: new Date(),
                })
                .where(eq(invoice.id, invoiceId));
            }

            // Remove the carrier payment(s); paymentAllocation rows cascade off
            // payment, so the credit_note + invoice allocations go with them.
            await tx
              .delete(payment)
              .where(
                and(
                  inArray(payment.id, carrierPaymentIds),
                  eq(payment.organizationId, ctx.organizationId)
                )
              );
          }

          return tx
            .update(creditNote)
            .set({
              status: "void",
              voidedAt: new Date(),
              // Voiding releases all applied credit: reset the open balance so the
              // note doesn't appear half-applied after the carriers are gone.
              amountApplied: 0,
              amountRemaining: found.total,
              updatedAt: new Date(),
            })
            .where(eq(creditNote.id, params.creditNoteId))
            .returning();
        });

        return { creditNote: updated };
      })
  );
}
