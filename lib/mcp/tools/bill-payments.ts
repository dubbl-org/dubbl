import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  bankAccount,
  bill,
  paymentBatch,
  paymentBatchItem,
  scheduledPayment,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";
import {
  BillPaymentError,
  processDueScheduledPayments,
  submitPaymentBatch,
} from "@/lib/api/bill-payment";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for paying bills in bulk or later: payment batches (a group of
 * bill payments submitted together) and scheduled payments (a bill payment
 * set for a future date), plus listing the bank accounts payments can be made
 * from. Mirrors /api/v1/payment-batches/** and /api/v1/scheduled-payments/**.
 * All amounts are integer cents. Direct DB access via Drizzle; org-scoped via
 * the AuthContext.
 */

const bankAccountColumns = { id: true, accountName: true, currencyCode: true } as const;

/** Load the org's bills by id, throwing if any is missing. */
async function loadBills(ctx: AuthContext, billIds: string[]) {
  if (billIds.length === 0) return [];
  const bills = await db.query.bill.findMany({
    where: and(
      eq(bill.organizationId, ctx.organizationId),
      inArray(bill.id, billIds),
      notDeleted(bill.deletedAt)
    ),
    columns: { id: true, contactId: true, currencyCode: true },
  });
  const missing = billIds.find((id) => !bills.some((b) => b.id === id));
  if (missing) throw new BillPaymentError(`Bill ${missing} not found`, 404);
  return bills;
}

/** Throw when the bank account can't pay bills in these currencies. */
async function assertBankAccount(ctx: AuthContext, bankAccountId: string | null | undefined, currencies: string[]) {
  if (!bankAccountId) return;
  const error = await checkPaymentBankAccount(ctx.organizationId, bankAccountId, currencies);
  if (error) throw new BillPaymentError(error);
}

const bankAccountIdField = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .describe(
    "UUID of the bank account (from list_bank_accounts) the money leaves from. It must be in the bills' currency or the base currency. Omit or null for the default bank account (ledger account 1100)"
  );

export function registerBillPaymentTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_bank_accounts",
    "List the organization's bank accounts (id, name, bank, currency, type, active flag, current balance in integer cents, linked ledger account id). Use the id as bankAccountId when paying bills, creating payment batches or scheduling payments.",
    {
      includeInactive: z
        .boolean()
        .optional()
        .default(false)
        .describe("Also return bank accounts marked inactive (default false)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const accounts = await db.query.bankAccount.findMany({
          where: and(
            eq(bankAccount.organizationId, ctx.organizationId),
            notDeleted(bankAccount.deletedAt),
            params.includeInactive ? undefined : eq(bankAccount.isActive, true)
          ),
          orderBy: bankAccount.accountName,
          columns: {
            id: true,
            accountName: true,
            bankName: true,
            currencyCode: true,
            accountType: true,
            isActive: true,
            balance: true,
            chartAccountId: true,
          },
        });
        return { bankAccounts: accounts };
      })
  );

  // ---------------------------------------------------------------------------
  // Scheduled payments
  // ---------------------------------------------------------------------------

  server.tool(
    "list_scheduled_payments",
    "List scheduled bill payments, newest scheduled date first, with their bill, supplier and bank account. Amounts are integer cents. Status is pending (waiting for its date), processing, completed (paid), failed or cancelled. Returns the payments plus the total count.",
    {
      status: z
        .enum(["pending", "processing", "completed", "failed", "cancelled"])
        .optional()
        .describe("Only return scheduled payments with this status"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Number to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(scheduledPayment.organizationId, ctx.organizationId),
          notDeleted(scheduledPayment.deletedAt),
        ];
        if (params.status) conditions.push(eq(scheduledPayment.status, params.status));

        const items = await db.query.scheduledPayment.findMany({
          where: and(...conditions),
          orderBy: desc(scheduledPayment.scheduledDate),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: {
            bill: { with: { contact: true } },
            contact: true,
            bankAccount: { columns: bankAccountColumns },
          },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(scheduledPayment)
          .where(and(...conditions));

        return {
          scheduledPayments: items,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_scheduled_payment",
    "Schedule a bill payment for a future date. Nothing is paid or posted until process_scheduled_payments runs on or after that date; then it is paid like pay_bill (DR Accounts Payable / CR the bank account's ledger account). Amount is integer cents in the bill's currency. Returns the scheduled payment.",
    {
      billId: z.string().uuid().describe("UUID of the bill to pay"),
      amount: z.number().int().positive().describe("Amount to pay in integer cents, in the bill's currency"),
      scheduledDate: z.string().min(1).describe("Date to pay on (YYYY-MM-DD); the payment posts on this date"),
      notes: z.string().nullable().optional().describe("Free-text note, copied onto the payment"),
      bankAccountId: bankAccountIdField,
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const [found] = await loadBills(ctx, [params.billId]);
        await assertBankAccount(ctx, params.bankAccountId, [found.currencyCode]);

        const [created] = await db
          .insert(scheduledPayment)
          .values({
            organizationId: ctx.organizationId,
            billId: found.id,
            contactId: found.contactId,
            amount: params.amount,
            currencyCode: found.currencyCode,
            scheduledDate: params.scheduledDate,
            bankAccountId: params.bankAccountId || null,
            notes: params.notes || null,
          })
          .returning();

        logAudit({ ctx, action: "create", entityType: "scheduled_payment", entityId: created.id });
        return { scheduledPayment: created };
      })
  );

  server.tool(
    "update_scheduled_payment",
    "Change a pending scheduled payment: its date, amount (integer cents), notes or the bank account it is paid from. Only pending ones can be changed. Returns the updated scheduled payment.",
    {
      scheduledPaymentId: z.string().uuid().describe("UUID of the scheduled payment"),
      scheduledDate: z.string().optional().describe("New date to pay on (YYYY-MM-DD)"),
      amount: z.number().int().positive().optional().describe("New amount in integer cents"),
      notes: z.string().nullable().optional().describe("New note (null clears it)"),
      bankAccountId: bankAccountIdField,
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const existing = await db.query.scheduledPayment.findFirst({
          where: and(
            eq(scheduledPayment.id, params.scheduledPaymentId),
            eq(scheduledPayment.organizationId, ctx.organizationId),
            notDeleted(scheduledPayment.deletedAt)
          ),
        });
        if (!existing) throw new BillPaymentError("Scheduled payment not found", 404);
        if (existing.status !== "pending") {
          throw new BillPaymentError("Only pending scheduled payments can be updated");
        }
        if (params.bankAccountId) {
          const bills = existing.billId ? await loadBills(ctx, [existing.billId]) : [];
          await assertBankAccount(ctx, params.bankAccountId, [bills[0]?.currencyCode ?? existing.currencyCode]);
        }

        const updates: Partial<typeof scheduledPayment.$inferInsert> = { updatedAt: new Date() };
        if (params.scheduledDate !== undefined) updates.scheduledDate = params.scheduledDate;
        if (params.amount !== undefined) updates.amount = params.amount;
        if (params.notes !== undefined) updates.notes = params.notes;
        if (params.bankAccountId !== undefined) updates.bankAccountId = params.bankAccountId;

        const [updated] = await db
          .update(scheduledPayment)
          .set(updates)
          .where(eq(scheduledPayment.id, existing.id))
          .returning();

        logAudit({ ctx, action: "update", entityType: "scheduled_payment", entityId: existing.id });
        return { scheduledPayment: updated };
      })
  );

  server.tool(
    "cancel_scheduled_payment",
    "Cancel a pending scheduled payment so it is never paid. It stays in the list with status cancelled. Returns the updated scheduled payment.",
    {
      scheduledPaymentId: z.string().uuid().describe("UUID of the scheduled payment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const [updated] = await db
          .update(scheduledPayment)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(scheduledPayment.id, params.scheduledPaymentId),
              eq(scheduledPayment.organizationId, ctx.organizationId),
              eq(scheduledPayment.status, "pending"),
              notDeleted(scheduledPayment.deletedAt)
            )
          )
          .returning();
        if (!updated) throw new BillPaymentError("No pending scheduled payment with that id", 404);

        logAudit({ ctx, action: "update", entityType: "scheduled_payment", entityId: updated.id, changes: { status: "cancelled" } });
        return { scheduledPayment: updated };
      })
  );

  server.tool(
    "delete_scheduled_payment",
    "Delete a scheduled payment (moves it to trash). Payments already made from it are not affected. Returns { success: true }.",
    {
      scheduledPaymentId: z.string().uuid().describe("UUID of the scheduled payment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const [deleted] = await db
          .update(scheduledPayment)
          .set(softDelete())
          .where(
            and(
              eq(scheduledPayment.id, params.scheduledPaymentId),
              eq(scheduledPayment.organizationId, ctx.organizationId),
              notDeleted(scheduledPayment.deletedAt)
            )
          )
          .returning({ id: scheduledPayment.id });
        if (!deleted) throw new BillPaymentError("Scheduled payment not found", 404);

        logAudit({ ctx, action: "delete", entityType: "scheduled_payment", entityId: deleted.id });
        return { success: true };
      })
  );

  server.tool(
    "process_scheduled_payments",
    "Pay every pending scheduled payment whose date is today or earlier (UTC). Each is paid on its scheduled date from its bank account, like pay_bill, in its own transaction; one that can't be paid (bill no longer due, locked period, missing exchange rate, ...) is marked failed and the rest carry on. Returns { processed, total, failures: [{ scheduledPaymentId, billId, error }] }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        return processDueScheduledPayments(ctx);
      })
  );

  // ---------------------------------------------------------------------------
  // Payment batches
  // ---------------------------------------------------------------------------

  server.tool(
    "list_payment_batches",
    "List bill payment batches, newest first, with their items. Amounts are integer cents. Status is draft (editable), submitted or completed. Returns the batches plus the total count.",
    {
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Number to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(paymentBatch.organizationId, ctx.organizationId),
          notDeleted(paymentBatch.deletedAt),
        ];
        const batches = await db.query.paymentBatch.findMany({
          where: and(...conditions),
          orderBy: desc(paymentBatch.createdAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: { items: true, bankAccount: { columns: bankAccountColumns } },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(paymentBatch)
          .where(and(...conditions));

        return {
          batches,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_payment_batch",
    "Get one payment batch with its items (each with its bill and supplier), its bank account and item statuses (pending, completed, failed). Amounts are integer cents.",
    {
      batchId: z.string().uuid().describe("UUID of the payment batch"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const batch = await db.query.paymentBatch.findFirst({
          where: and(
            eq(paymentBatch.id, params.batchId),
            eq(paymentBatch.organizationId, ctx.organizationId),
            notDeleted(paymentBatch.deletedAt)
          ),
          with: {
            items: { with: { bill: { with: { contact: true } }, contact: true } },
            bankAccount: { columns: bankAccountColumns },
          },
        });
        if (!batch) throw new BillPaymentError("Payment batch not found", 404);
        return { batch };
      })
  );

  server.tool(
    "create_payment_batch",
    "Create a draft payment batch: a group of bill payments paid together from one bank account when you call submit_payment_batch. Nothing is paid or posted until then. Each item amount is integer cents in its bill's currency. Returns the batch with its items.",
    {
      name: z.string().min(1).describe("Batch name, e.g. 'March supplier payments'"),
      bankAccountId: bankAccountIdField,
      items: z
        .array(
          z.object({
            billId: z.string().uuid().describe("UUID of the bill to pay"),
            amount: z.number().int().positive().describe("Amount to pay on this bill in integer cents"),
          })
        )
        .min(1)
        .describe("The bills to pay (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const bills = await loadBills(ctx, params.items.map((i) => i.billId));
        await assertBankAccount(ctx, params.bankAccountId, bills.map((b) => b.currencyCode));
        const billById = new Map(bills.map((b) => [b.id, b]));
        const currencies = new Set(bills.map((b) => b.currencyCode));

        const batchId = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(paymentBatch)
            .values({
              organizationId: ctx.organizationId,
              name: params.name,
              currencyCode: currencies.size === 1 ? [...currencies][0] : "USD",
              bankAccountId: params.bankAccountId || null,
              totalAmount: params.items.reduce((sum, i) => sum + i.amount, 0),
              paymentCount: params.items.length,
            })
            .returning({ id: paymentBatch.id });
          await tx.insert(paymentBatchItem).values(
            params.items.map((i) => ({
              batchId: created.id,
              billId: i.billId,
              contactId: billById.get(i.billId)!.contactId,
              amount: i.amount,
              currencyCode: billById.get(i.billId)!.currencyCode,
            }))
          );
          return created.id;
        });

        const batch = await db.query.paymentBatch.findFirst({
          where: eq(paymentBatch.id, batchId),
          with: { items: true, bankAccount: { columns: bankAccountColumns } },
        });
        return { batch };
      })
  );

  server.tool(
    "update_payment_batch",
    "Change a draft payment batch: rename it, change the bank account it pays from, add bills or remove items. Item amounts are integer cents. Only draft batches can be changed. Returns the updated batch.",
    {
      batchId: z.string().uuid().describe("UUID of the payment batch"),
      name: z.string().min(1).optional().describe("New batch name"),
      bankAccountId: bankAccountIdField,
      addItems: z
        .array(
          z.object({
            billId: z.string().uuid().describe("UUID of the bill to pay"),
            amount: z.number().int().positive().describe("Amount to pay on this bill in integer cents"),
          })
        )
        .optional()
        .describe("Bills to add to the batch"),
      removeItemIds: z
        .array(z.string().uuid())
        .optional()
        .describe("UUIDs of batch items (not bills) to remove"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const existing = await db.query.paymentBatch.findFirst({
          where: and(
            eq(paymentBatch.id, params.batchId),
            eq(paymentBatch.organizationId, ctx.organizationId),
            notDeleted(paymentBatch.deletedAt)
          ),
          with: { items: true },
        });
        if (!existing) throw new BillPaymentError("Payment batch not found", 404);
        if (existing.status !== "draft") throw new BillPaymentError("Only draft batches can be updated");

        const removed = new Set(params.removeItemIds ?? []);
        const added = await loadBills(ctx, (params.addItems ?? []).map((i) => i.billId));
        const addedById = new Map(added.map((b) => [b.id, b]));
        const bankAccountId = params.bankAccountId !== undefined ? params.bankAccountId : existing.bankAccountId;
        if (bankAccountId) {
          const kept = existing.items.filter((i) => !removed.has(i.id)).map((i) => i.billId).filter((b): b is string => !!b);
          const keptBills = await loadBills(ctx, kept);
          await assertBankAccount(ctx, bankAccountId, [...keptBills, ...added].map((b) => b.currencyCode));
        }

        await db.transaction(async (tx) => {
          if (params.removeItemIds?.length) {
            await tx
              .delete(paymentBatchItem)
              .where(and(eq(paymentBatchItem.batchId, existing.id), inArray(paymentBatchItem.id, params.removeItemIds)));
          }
          if (params.addItems?.length) {
            await tx.insert(paymentBatchItem).values(
              params.addItems.map((i) => ({
                batchId: existing.id,
                billId: i.billId,
                contactId: addedById.get(i.billId)!.contactId,
                amount: i.amount,
                currencyCode: addedById.get(i.billId)!.currencyCode,
              }))
            );
          }
          const items = await tx.query.paymentBatchItem.findMany({
            where: eq(paymentBatchItem.batchId, existing.id),
            columns: { amount: true },
          });
          await tx
            .update(paymentBatch)
            .set({
              ...(params.name ? { name: params.name } : {}),
              ...(params.bankAccountId !== undefined ? { bankAccountId: params.bankAccountId } : {}),
              totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
              paymentCount: items.length,
            })
            .where(eq(paymentBatch.id, existing.id));
        });

        const batch = await db.query.paymentBatch.findFirst({
          where: eq(paymentBatch.id, existing.id),
          with: { items: true, bankAccount: { columns: bankAccountColumns } },
        });
        return { batch };
      })
  );

  server.tool(
    "submit_payment_batch",
    "Submit a draft payment batch: pay every item's bill today from the batch's bank account, like pay_bill (DR Accounts Payable / CR the bank account's ledger account). Each item runs in its own transaction; one that can't be paid (bill no longer due, locked period, missing exchange rate, ...) is marked failed and the rest carry on. The batch ends up completed. Returns { batch, processed, total, failures: [{ itemId, billId, error }] }.",
    {
      batchId: z.string().uuid().describe("UUID of the draft payment batch"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const result = await submitPaymentBatch(ctx, params.batchId);
        if (!result) throw new BillPaymentError("Payment batch not found", 404);
        return result;
      })
  );
}
