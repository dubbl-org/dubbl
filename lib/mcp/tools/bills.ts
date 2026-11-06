import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { applyContactDefaults, loadContactDefaults } from "@/lib/api/contact-defaults";
import { z } from "zod";
import { db } from "@/lib/db";
import { bill, billLine, inventoryItem } from "@/lib/db/schema";
import { eq, and, ne, desc, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import { recordInventoryIssue, type ValuedItem } from "@/lib/api/inventory-valuation";
import { buildBillLines, loadBillTaxContext } from "@/lib/api/bill-lines";
import { assertLineStockRefs } from "@/lib/api/line-stock-refs";
import { wrapTool } from "@/lib/mcp/errors";
import { approveEntity, postDraftBill, rejectEntity, submitForApproval } from "@/lib/approvals/entities";
import { ApprovalError } from "@/lib/approvals/errors";
import {
  ProcurementBlockedError,
  releaseBillPurchaseOrderQuantities,
  recountBillPurchaseOrders,
  findBillGrniEntries,
  resolveProcurementLines,
  reverseBillGrniPostings,
} from "@/app/api/v1/bills/_procurement";
import type { AuthContext } from "@/lib/api/auth-context";
import { checkMultiCurrency } from "@/lib/api/check-limit";
import { recordBillPayment } from "@/lib/api/bill-payment";
import { emitBillCreated } from "@/lib/webhooks/events";

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
    "Create a new bill (accounts payable). Unit prices are decimal numbers (e.g. 12.50 for $12.50). The system calculates totals and assigns a bill number automatically. Lines without accountId get the supplier's default spending account and lines that omit taxRateId get the supplier's default tax rate (Contacts > Bookkeeping). A line with inventoryItemId is a stock purchase: on posting it capitalises into the item's Inventory account and increases on-hand quantity/value (optionally into warehouseId) instead of expensing. Pass projectId on a line to job-cost it against a project.",
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
        await assertLineStockRefs(ctx.organizationId, params.lines);
        await checkMultiCurrency(ctx.organizationId, params.currencyCode);

        await assertNotLocked(ctx.organizationId, params.issueDate);

        // The supplier's defaults: spending account and tax rate for lines
        // that don't set one.
        params.lines = applyContactDefaults(
          params.lines,
          await loadContactDefaults(ctx.organizationId, params.contactId),
          "purchase"
        );

        const billNumber = await getNextNumber(
          ctx.organizationId,
          "bill",
          "bill_number",
          "BILL"
        );

        // Same line math as the REST route (reverse-charge VAT is netted out
        // of amountDue because the supplier is paid net).
        const { rates, kinds } = await loadBillTaxContext(params.lines);
        const built = buildBillLines(params.lines, params.currencyCode, rates, kinds);
        const { subtotal, taxTotal, total } = built;

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
            amountDue: built.amountDue,
            currencyCode: params.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();
        emitBillCreated(ctx.organizationId, [created.id]);

        await db.insert(billLine).values(
          built.lines.map((l) => ({
            billId: created.id,
            ...l,
          }))
        );

        return { bill: created };
      })
  );

  server.tool(
    "update_bill",
    "Edit a DRAFT bill (bills already added to the books, paid or voided can't be edited). Send only the header fields to change; send lines to replace the whole line set, and totals are recalculated. Unit prices are decimal numbers (e.g. 12.50 for $12.50); quantities are decimals. Returns the updated bill with amounts in integer cents.",
    {
      billId: z.string().describe("The UUID of the draft bill to edit"),
      contactId: z.string().optional().describe("New supplier contact UUID"),
      billNumber: z
        .string()
        .optional()
        .describe("The supplier's invoice number. Rejected if another non-void bill from the same supplier already uses it"),
      issueDate: z.string().optional().describe("New issue date (YYYY-MM-DD)"),
      dueDate: z.string().optional().describe("New due date (YYYY-MM-DD)"),
      reference: z.string().nullable().optional().describe("Bill reference, or null to clear it"),
      notes: z.string().nullable().optional().describe("Bill notes, or null to clear them"),
      lines: z
        .array(
          z.object({
            description: z.string().min(1).describe("Line item description"),
            quantity: z.number().optional().default(1).describe("Quantity (decimal)"),
            unitPrice: z.number().optional().default(0).describe("Unit price (decimal, e.g. 12.50)"),
            accountId: z.string().optional().describe("Expense account UUID"),
            taxRateId: z.string().optional().describe("Tax rate UUID"),
            discountPercent: z
              .number()
              .int()
              .min(0)
              .max(10000)
              .optional()
              .describe("Discount in basis points (1000 = 10%)"),
            inventoryItemId: z.string().optional().describe("Inventory item UUID for a stock purchase line"),
            warehouseId: z.string().optional().describe("Warehouse UUID the stock is received into"),
            projectId: z.string().optional().describe("Project UUID for job-costing this line"),
            goodsReceiptLineId: z.string().optional().describe("Goods receipt line UUID this bill line matches"),
          })
        )
        .min(1)
        .optional()
        .describe("Replacement line items. Omit to keep the current lines"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");
        await assertLineStockRefs(ctx.organizationId, params.lines ?? []);

        const existing = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, params.billId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });
        if (!existing) throw new Error("Bill not found");
        if (existing.status !== "draft") throw new Error("Only draft bills can be edited");
        if (params.issueDate) await assertNotLocked(ctx.organizationId, params.issueDate);

        const update: Record<string, unknown> = { updatedAt: new Date() };
        for (const key of ["contactId", "issueDate", "dueDate", "reference", "notes"] as const) {
          if (params[key] !== undefined) update[key] = params[key];
        }

        const billNumber = params.billNumber?.trim();
        const contactId = params.contactId ?? existing.contactId;
        if (billNumber && (billNumber !== existing.billNumber || contactId !== existing.contactId)) {
          const dup = await db.query.bill.findFirst({
            where: and(
              eq(bill.organizationId, ctx.organizationId),
              eq(bill.contactId, contactId),
              eq(bill.billNumber, billNumber),
              ne(bill.status, "void"),
              ne(bill.id, existing.id),
              notDeleted(bill.deletedAt)
            ),
            columns: { id: true },
          });
          if (dup) throw new Error(`A bill with number "${billNumber}" already exists for this supplier`);
          update.billNumber = billNumber;
        }

        if (params.lines) {
          const { rates, kinds } = await loadBillTaxContext(params.lines);
          const built = buildBillLines(params.lines, existing.currencyCode, rates, kinds);
          update.subtotal = built.subtotal;
          update.taxTotal = built.taxTotal;
          update.total = built.total;
          update.amountDue = built.amountDue - existing.amountPaid;
          await db.transaction(async (tx) => {
            await tx.delete(billLine).where(eq(billLine.billId, existing.id));
            await tx.insert(billLine).values(built.lines.map((l) => ({ billId: existing.id, ...l })));
            // Linked purchase orders: count the new lines instead of the old ones.
            await recountBillPurchaseOrders(ctx.organizationId, existing.id, tx);
          });
        }

        const [updated] = await db
          .update(bill)
          .set(update)
          .where(eq(bill.id, existing.id))
          .returning();

        return { bill: updated };
      })
  );

  server.tool(
    "approve_bill",
    "Approve a bill and post it to the ledger (requires approve:bills). A pending_approval bill with an approval workflow request: only the current step's approver can act, and the bill posts (status 'received', journal entry created) only after the last step approves; until then it stays pending_approval. A pending_approval bill without a workflow, or a draft bill, posts straight away. Blocked when the issue date is in a locked period or a three-way-match tolerance is broken. Returns the bill, the approval request (null without a workflow), finalized (true once posted) and any match warnings.",
    {
      billId: z.string().describe("The UUID of the bill to approve"),
      comment: z.string().optional().describe("Optional comment recorded with the approval (workflow approvals only)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        try {
          const existing = await db.query.bill.findFirst({
            where: and(
              eq(bill.id, params.billId),
              eq(bill.organizationId, ctx.organizationId),
              notDeleted(bill.deletedAt)
            ),
            columns: { status: true },
          });
          if (!existing) throw new ApprovalError("Bill not found", 404);
          const outcome =
            existing.status === "draft"
              ? await postDraftBill(ctx, params.billId)
              : await approveEntity(ctx, "bill", params.billId, params.comment);
          return {
            bill: outcome.entity,
            request: outcome.request,
            finalized: outcome.finalized,
            warnings: outcome.warnings ?? [],
          };
        } catch (err) {
          if (err instanceof ProcurementBlockedError) {
            throw new ApprovalError(`${err.message}: ${JSON.stringify(err.issues)}`, 422);
          }
          throw err;
        }
      })
  );

  server.tool(
    "submit_bill_for_approval",
    "Send a draft bill for approval: status becomes 'pending_approval'. When an active approval workflow matches the bill (the most specific one wins, then the oldest), an approval request is opened and its approvers are notified in order; otherwise anyone with approve:bills can approve it. Returns the bill and the approval request (null when no workflow applies).",
    {
      billId: z.string().describe("The UUID of the draft bill to submit"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await submitForApproval(ctx, "bill", params.billId);
        return { bill: outcome.entity, request: outcome.request };
      })
  );

  server.tool(
    "reject_bill",
    "Reject a bill that is pending approval (requires approve:bills; with an approval workflow only the current step's approver can act). The bill goes back to 'draft' with the reason recorded so it can be fixed and submitted again, and the approval request is rejected. Returns the bill and the request.",
    {
      billId: z.string().describe("The UUID of the bill to reject"),
      reason: z.string().optional().describe("Why the bill is rejected"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await rejectEntity(ctx, "bill", params.billId, params.reason);
        return { bill: outcome.entity, request: outcome.request };
      })
  );

  server.tool(
    "pay_bill",
    "Record a payment against a bill (money paid to the supplier). Amount is in integer cents (e.g. 1250 = $12.50), in the bill's currency, and must not exceed the bill's amountDue. The bill must be approved (status received, partial or overdue). Atomically creates the payment record and its allocation, posts the journal entry (DR Accounts Payable / CR the bank account's ledger account, with realised FX for a foreign-currency bill) and updates the bill to 'paid' or 'partial'. Pass bankAccountId to pay from a specific bank account (it must be in the bill's currency or the base currency); omit it to use the default bank account (1100). Fails if the date is in a locked period. Returns the updated bill and the payment.",
    {
      billId: z.string().describe("The UUID of the bill"),
      amount: z
        .number()
        .int()
        .min(1)
        .describe("Payment amount in integer cents, in the bill's currency"),
      date: z
        .string()
        .optional()
        .describe("Payment date (YYYY-MM-DD); defaults to today. The journal entry posts on this date"),
      method: z
        .enum(["bank_transfer", "cash", "check", "card", "other"])
        .optional()
        .default("bank_transfer")
        .describe("How the money was paid (defaults to bank_transfer)"),
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
        .describe("UUID of the bank account (from list_bank_accounts) the money leaves from. Omit for the default bank account (ledger account 1100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");

        const { bill: updated, payment } = await recordBillPayment(ctx, {
          billId: params.billId,
          amount: params.amount,
          date: params.date || new Date().toISOString().split("T")[0],
          method: params.method,
          reference: params.reference,
          bankAccountId: params.bankAccountId,
        });

        return { bill: updated, payment };
      })
  );

  server.tool(
    "void_bill",
    "Void a bill and reverse its bookkeeping. Reverses the posted GL entry (expense/inventory, input VAT, accounts payable), any GRNI clearing / price variance entry from lines matched to goods receipts (the receipts go back to received), the perpetual stock receipt for unmatched stock lines, and gives linked purchase orders back their billed quantities. Blocked if the bill has recorded payments (unapply/refund first) or its period is locked. Amounts in integer cents.",
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

        // Lines matched to a goods receipt post a separate GRNI clearing entry
        // (and no main entry when every line is matched): reverse those too.
        const allLines = await db.query.billLine.findMany({
          where: eq(billLine.billId, params.billId),
        });
        const grniEntries = await findBillGrniEntries(ctx.organizationId, existing, allLines);
        const wasPosted = !!existing.journalEntryId || grniEntries.length > 0;
        if (wasPosted) {
          await assertNotLocked(ctx.organizationId, existing.issueDate, ctx);
          for (const e of grniEntries) {
            if (e.date !== existing.issueDate) await assertNotLocked(ctx.organizationId, e.date, ctx);
          }
        }

        const lines = wasPosted ? allLines : [];
        // Stock on matched lines came in with the goods receipt, not the bill.
        const { matched } = wasPosted
          ? await resolveProcurementLines(ctx, lines)
          : { matched: [] };
        const matchedIds = new Set(matched.map((m) => m.billLine.id));
        const stockLines = lines.filter((l) => l.inventoryItemId && !matchedIds.has(l.id));

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

          if (wasPosted) {
            await reverseBillGrniPostings(ctx, existing, allLines, tx);
          }
          await releaseBillPurchaseOrderQuantities(ctx.organizationId, existing.id, tx);

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

  server.tool(
    "delete_bill",
    "Delete a draft bill (requires manage:bills). Only bills in 'draft' status can be deleted; void a posted bill instead. Any purchase order quantities the bill counted as billed are given back, and those purchase orders' statuses are recalculated. Returns { success: true, billId }.",
    {
      billId: z.string().describe("The UUID of the draft bill to delete"),
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
        if (existing.status !== "draft") {
          throw new Error("Only draft bills can be deleted. Void a posted bill instead.");
        }

        await db.transaction(async (tx) => {
          await releaseBillPurchaseOrderQuantities(ctx.organizationId, existing.id, tx);
          await tx.delete(billLine).where(eq(billLine.billId, existing.id));
          await tx.update(bill).set(softDelete()).where(eq(bill.id, existing.id));
        });

        return { success: true, billId: existing.id };
      })
  );
}
