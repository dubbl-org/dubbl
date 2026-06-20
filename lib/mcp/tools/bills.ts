import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { bill, billLine, inventoryItem } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import { recordInventoryIssue, type ValuedItem } from "@/lib/api/inventory-valuation";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerBillTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_bills",
    "List bills (accounts payable) with optional status filter. Amounts are in integer cents.",
    {
      status: z
        .enum([
          "draft",
          "pending_approval",
          "received",
          "partial",
          "paid",
          "overdue",
          "void",
        ])
        .optional()
        .describe("Filter by bill status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of bills to return (max 100)"),
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
          eq(bill.organizationId, ctx.organizationId),
          notDeleted(bill.deletedAt),
        ];

        if (params.status) {
          conditions.push(eq(bill.status, params.status));
        }

        const offset = (params.page - 1) * params.limit;

        const bills = await db.query.bill.findMany({
          where: and(...conditions),
          orderBy: desc(bill.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(bill)
          .where(and(...conditions));

        return {
          bills,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_bill",
    "Create a new bill (accounts payable). Unit prices are decimal numbers (e.g. 12.50 for $12.50). The system calculates totals and assigns a bill number automatically. A line with inventoryItemId is a stock purchase: on posting it capitalises into the item's Inventory account and increases on-hand quantity/value (optionally into warehouseId) instead of expensing. Pass projectId on a line to job-cost it against a project.",
    {
      contactId: z.string().describe("Supplier contact UUID"),
      issueDate: z.string().describe("Issue date (YYYY-MM-DD)"),
      dueDate: z.string().describe("Due date (YYYY-MM-DD)"),
      reference: z
        .string()
        .optional()
        .describe("Supplier's invoice reference"),
      notes: z.string().optional().describe("Bill notes"),
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
              .describe("Expense account UUID"),
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
              .describe("Discount in basis points (1000 = 10%)"),
            inventoryItemId: z
              .string()
              .optional()
              .describe(
                "Inventory item UUID. Marks this line as a stock purchase: on bill posting it capitalises into the item's Inventory account and increases on-hand quantity/value instead of expensing."
              ),
            warehouseId: z
              .string()
              .optional()
              .describe(
                "Warehouse UUID the stock is received into (used with inventoryItemId)."
              ),
            projectId: z
              .string()
              .optional()
              .describe("Project UUID for job-costing this line against a project."),
          })
        )
        .min(1)
        .describe("Bill line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        await assertNotLocked(ctx.organizationId, params.issueDate);

        const billNumber = await getNextNumber(
          ctx.organizationId,
          "bill",
          "bill_number",
          "BILL"
        );

        const taxRateIds = params.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
        const ratesMap = await preloadTaxRates(taxRateIds);

        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const discountPercent = l.discountPercent ?? 0;
          const grossAmount = decimalToCents(l.quantity * l.unitPrice);
          const discountAmount = discountPercent ? Math.round(grossAmount * discountPercent / 10000) : 0;
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
            discountPercent,
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
          .insert(bill)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            billNumber,
            issueDate: params.issueDate,
            dueDate: params.dueDate,
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

        await db.insert(billLine).values(
          processedLines.map((l) => ({
            billId: created.id,
            ...l,
          }))
        );

        return { bill: created };
      })
  );

  server.tool(
    "approve_bill",
    "Approve a draft or pending_approval bill. Changes status to 'received'. Requires admin role.",
    {
      billId: z.string().describe("The UUID of the bill to approve"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:bills");

        const existing = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, params.billId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });

        if (!existing) throw new Error("Bill not found");
        if (!["draft", "pending_approval"].includes(existing.status)) {
          throw new Error(
            "Only draft or pending approval bills can be approved"
          );
        }

        const [updated] = await db
          .update(bill)
          .set({
            status: "received",
            approvedBy: ctx.userId,
            approvedAt: new Date(),
            receivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bill.id, params.billId))
          .returning();

        return { bill: updated };
      })
  );

  server.tool(
    "pay_bill",
    "Record a payment against a bill. Amount is in integer cents (e.g. 1250 = $12.50). Automatically updates status to 'paid' or 'partial'.",
    {
      billId: z.string().describe("The UUID of the bill"),
      amount: z
        .number()
        .int()
        .min(1)
        .describe("Payment amount in cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const existing = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, params.billId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });

        if (!existing) throw new Error("Bill not found");
        if (existing.status === "void") {
          throw new Error("Cannot pay a voided bill");
        }
        if (existing.status === "paid") {
          throw new Error("Bill is already fully paid");
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
          .update(bill)
          .set({
            amountPaid: newAmountPaid,
            amountDue: newAmountDue,
            status: newStatus,
            paidAt: newAmountDue === 0 ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(bill.id, params.billId))
          .returning();

        return { bill: updated };
      })
  );

  server.tool(
    "void_bill",
    "Void a bill and reverse its bookkeeping. Reverses the posted GL entry (expense/inventory, input VAT, accounts payable) and the perpetual stock receipt for any stock lines. Blocked if the bill has recorded payments (unapply/refund first) or its period is locked. Amounts in integer cents.",
    {
      billId: z.string().describe("The UUID of the bill to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const existing = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, params.billId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });

        if (!existing) throw new Error("Bill not found");
        if (existing.status === "void") {
          throw new Error("Bill is already voided");
        }
        if (existing.amountPaid > 0) {
          throw new Error(
            "Cannot void a bill with recorded payments. Unapply or refund the payment first, then void."
          );
        }

        const wasPosted = !!existing.journalEntryId;
        if (wasPosted) {
          await assertNotLocked(ctx.organizationId, existing.issueDate, ctx);
        }

        const lines = wasPosted
          ? await db.query.billLine.findMany({
              where: eq(billLine.billId, params.billId),
            })
          : [];
        const stockLines = lines.filter((l) => l.inventoryItemId);

        const [updated] = await db.transaction(async (tx) => {
          if (wasPosted && existing.journalEntryId) {
            await reverseJournalEntry(
              { organizationId: ctx.organizationId, userId: ctx.userId },
              {
                entryId: existing.journalEntryId,
                date: existing.issueDate,
                description: `Void bill ${existing.billNumber}`,
                reference: existing.billNumber,
                sourceType: "bill_void",
                sourceId: existing.id,
              },
              tx
            );
          }

          for (const line of stockLines) {
            const units = Math.round(line.quantity / 100);
            if (units <= 0 || !line.inventoryItemId) continue;
            const item = await tx.query.inventoryItem.findFirst({
              where: and(
                eq(inventoryItem.id, line.inventoryItemId),
                eq(inventoryItem.organizationId, ctx.organizationId)
              ),
            });
            if (!item) continue;
            await recordInventoryIssue(tx, {
              item: item as ValuedItem,
              quantity: units,
              warehouseId: line.warehouseId,
              type: "adjustment",
              referenceType: "bill_void",
              referenceId: existing.id,
              createdBy: ctx.userId,
            });
          }

          return tx
            .update(bill)
            .set({
              status: "void",
              voidedAt: new Date(),
              amountDue: 0,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, params.billId))
            .returning();
        });

        return { bill: updated };
      })
  );
}
