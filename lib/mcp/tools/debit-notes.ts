import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { debitNote, debitNoteLine, bill } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

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
    "Apply a supplier debit note's credit against a bill, reducing what you owe. amount is in integer cents and must not exceed the debit note's remaining balance or the bill's outstanding amount due. The debit note must be 'sent' or 'applied' (not draft). The bill must belong to the same supplier and currency, and not be draft/void. Increments the debit note's amountApplied (marking it 'applied' when fully used), and updates the bill's amountPaid/amountDue and status ('paid' or 'partial'). Returns the updated debit note and bill.",
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

        const found = await db.query.debitNote.findFirst({
          where: and(
            eq(debitNote.id, params.debitNoteId),
            eq(debitNote.organizationId, ctx.organizationId),
            notDeleted(debitNote.deletedAt)
          ),
        });
        if (!found) throw new Error("Debit note not found");
        if (found.status !== "sent" && found.status !== "applied") {
          throw new Error("Debit note must be sent before it can be applied");
        }
        if (params.amount > found.amountRemaining) {
          throw new Error("Amount exceeds remaining debit note balance");
        }

        const foundBill = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, params.billId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });
        if (!foundBill) throw new Error("Bill not found");
        if (foundBill.status === "draft" || foundBill.status === "void") {
          throw new Error("Cannot apply a credit to this bill status");
        }
        // The debit note belongs to one supplier — applying it to another
        // supplier's bill would corrupt both suppliers' balances.
        if (foundBill.contactId !== found.contactId) {
          throw new Error(
            "This supplier credit belongs to a different supplier than the bill."
          );
        }
        // Amounts offset 1:1, so a currency mismatch would reduce the bill by
        // the wrong figure and break the tie between AP and the GL.
        if (foundBill.currencyCode !== found.currencyCode) {
          throw new Error("The supplier credit and bill are in different currencies.");
        }
        if (params.amount > foundBill.amountDue) {
          throw new Error("Amount exceeds the bill's outstanding balance");
        }

        const newAmountApplied = found.amountApplied + params.amount;
        const newAmountRemaining = found.amountRemaining - params.amount;
        const dnStatus = newAmountRemaining <= 0 ? "applied" : "sent";

        // Settle against the bill's outstanding balance (amountDue), and do
        // both updates atomically so they can't drift apart on a failure.
        const newBillAmountPaid = foundBill.amountPaid + params.amount;
        const newBillAmountDue = foundBill.amountDue - params.amount;
        const billStatus = newBillAmountDue <= 0 ? "paid" : "partial";

        const { updatedDebitNote, updatedBill } = await db.transaction(async (tx) => {
          const [updatedDebitNote] = await tx
            .update(debitNote)
            .set({
              amountApplied: newAmountApplied,
              amountRemaining: Math.max(0, newAmountRemaining),
              status: dnStatus as (typeof debitNote.status.enumValues)[number],
              updatedAt: new Date(),
            })
            .where(eq(debitNote.id, params.debitNoteId))
            .returning();

          const [updatedBill] = await tx
            .update(bill)
            .set({
              amountPaid: newBillAmountPaid,
              amountDue: Math.max(0, newBillAmountDue),
              status: billStatus as (typeof bill.status.enumValues)[number],
              paidAt: billStatus === "paid" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, params.billId))
            .returning();

          return { updatedDebitNote, updatedBill };
        });

        return { debitNote: updatedDebitNote, bill: updatedBill };
      })
  );

  server.tool(
    "void_debit_note",
    "Void a supplier debit note. Marks its status 'void' and stamps voidedAt. Fails if it is already voided. Returns the updated debit note.",
    {
      debitNoteId: z.string().describe("The UUID of the debit note to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:debit-notes");

        const found = await db.query.debitNote.findFirst({
          where: and(
            eq(debitNote.id, params.debitNoteId),
            eq(debitNote.organizationId, ctx.organizationId),
            notDeleted(debitNote.deletedAt)
          ),
        });
        if (!found) throw new Error("Debit note not found");
        if (found.status === "void") throw new Error("Already voided");

        const [updated] = await db
          .update(debitNote)
          .set({
            status: "void",
            voidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(debitNote.id, params.debitNoteId))
          .returning();

        return { debitNote: updated };
      })
  );
}
