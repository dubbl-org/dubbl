import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { debitNote, debitNoteLine } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import { checkMultiCurrency } from "@/lib/api/check-limit";
import { applyDebitNote, voidDebitNote } from "@/lib/api/debit-notes";

/**
 * MCP tools for supplier debit notes (AP credit notes). A debit note records a
 * credit owed back by a supplier (e.g. a return or overcharge) and can be
 * applied against the supplier's bills to reduce what you owe.
 *
 * IMPORTANT money convention: unlike the REST route (which receives unitPrice
 * in dollars and multiplies by 100), these MCP tools ACCEPT unit prices as
 * integer minor units (cents) and store them directly. quantity is a decimal
 * number. discountPercent is in basis points (1000 = 10%). All amounts in
 * RESULTS are integer cents. Direct DB access via Drizzle (no HTTP self-calls).
 */
export function registerDebitNoteTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_debit_notes",
    "List supplier debit notes (AP credit notes) with optional filters and pagination. Amounts (subtotal, taxTotal, total, amountApplied, amountRemaining) are in integer cents.",
    {
      status: z
        .enum(["draft", "sent", "applied", "void"])
        .optional()
        .describe("Filter by debit-note status"),
      contactId: z.string().optional().describe("Filter by supplier contact UUID"),
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
        .describe("Number of debit notes to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(debitNote.organizationId, ctx.organizationId),
          notDeleted(debitNote.deletedAt),
        ];
        if (params.status) conditions.push(eq(debitNote.status, params.status));
        if (params.contactId) conditions.push(eq(debitNote.contactId, params.contactId));
        if (params.startDate) conditions.push(gte(debitNote.issueDate, params.startDate));
        if (params.endDate) conditions.push(lte(debitNote.issueDate, params.endDate));

        const offset = (params.page - 1) * params.limit;
        const debitNotes = await db.query.debitNote.findMany({
          where: and(...conditions),
          orderBy: desc(debitNote.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(debitNote)
          .where(and(...conditions));

        return {
          debitNotes,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_debit_note",
    "Get a single supplier debit note by ID, including its line items (with account and tax rate) and supplier contact. All amounts are in integer cents.",
    {
      debitNoteId: z.string().describe("The UUID of the debit note"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.debitNote.findFirst({
          where: and(
            eq(debitNote.id, params.debitNoteId),
            eq(debitNote.organizationId, ctx.organizationId),
            notDeleted(debitNote.deletedAt)
          ),
          with: {
            contact: true,
            lines: { with: { account: true, taxRate: true } },
          },
        });
        if (!found) throw new Error("Debit note not found");
        return { debitNote: found };
      })
  );

  server.tool(
    "create_debit_note",
    "Create a draft supplier debit note (AP credit note) with line items. unitPrice is in integer cents (e.g. 1250 = $12.50) and is stored directly; quantity is a decimal number (e.g. 1.5). discountPercent is in basis points (1000 = 10%). Lines are tax-EXCLUSIVE — tax is added on top per line. The system computes subtotal/tax/total and assigns a debit-note number (DN). Optionally link the original bill via billId. Returns the created debit note.",
    {
      contactId: z.string().describe("Supplier contact UUID"),
      billId: z
        .string()
        .optional()
        .describe("UUID of the original bill this credit relates to (optional)"),
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
            accountId: z.string().optional().describe("Expense/account UUID for this line"),
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
        .describe("Debit-note line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:debit-notes");
        await checkMultiCurrency(ctx.organizationId, params.currencyCode);
        await assertNotLocked(ctx.organizationId, params.issueDate);

        const debitNoteNumber = await getNextNumber(
          ctx.organizationId,
          "debit_note",
          "debit_note_number",
          "DN"
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
          .insert(debitNote)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            billId: params.billId || null,
            debitNoteNumber,
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

        await db.insert(debitNoteLine).values(
          processedLines.map((l) => ({
            debitNoteId: created.id,
            ...l,
          }))
        );

        return { debitNote: created };
      })
  );

  server.tool(
    "apply_debit_note",
    "Apply a supplier debit note's credit against a bill, reducing what you owe. amount is in integer cents and must not exceed the debit note's remaining balance or the bill's outstanding amount due. The debit note must be 'sent' or 'applied' (not draft). The bill must belong to the same supplier and currency and be in the books and open (status received, partial or overdue). No journal entry is posted (Accounts Payable was relieved when the debit note was sent); it records a zero-cash carrier payment with a debit_note and a bill allocation, increments the debit note's amountApplied (marking it 'applied' when fully used), and updates the bill's amountPaid/amountDue and status ('paid' or 'partial'). Returns the updated debit note and bill.",
    {
      debitNoteId: z.string().describe("The UUID of the debit note to apply"),
      billId: z.string().describe("The UUID of the bill to apply the credit to"),
      amount: z
        .number()
        .int()
        .min(1)
        .describe("Amount to apply, in integer cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:debit-notes");
        const result = await applyDebitNote(
          ctx,
          params.debitNoteId,
          params.billId,
          params.amount
        );
        return { debitNote: result.debitNote, bill: result.bill };
      })
  );

  server.tool(
    "void_debit_note",
    "Void (cancel) a supplier debit note and undo its effects. Fails if it is already voided. If it was sent (posted to the GL), posts a reversing journal entry (CR Accounts Payable / DR the line accounts / DR input tax) dated the debit note's issue date, and requires that period to be open. Every amount it applied to bills is given back: each bill's amountPaid/amountDue/status is restored and the carrier payment(s) recording the applications are removed. The debit note ends with status 'void', amountApplied 0 and amountRemaining 0. Returns the updated debit note.",
    {
      debitNoteId: z.string().describe("The UUID of the debit note to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:debit-notes");
        const result = await voidDebitNote(ctx, params.debitNoteId);
        return { debitNote: result.debitNote };
      })
  );
}
