import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  salesReceipt,
  salesReceiptLine,
  customerCredit,
  invoice,
  payment,
  paymentAllocation,
  bankAccount,
  chartAccount,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { checkMultiCurrency } from "@/lib/api/check-limit";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { wrapTool } from "@/lib/mcp/errors";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
  findAccountByCode,
  ensureControlAccount,
  ensureAccountByCode,
  createCogsJournalEntry,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for cash sales (sales receipts) and customer credits
 * (prepayments / deposits / overpayments held on account).
 *
 * All monetary amounts in RESULTS are integer cents. Tool INPUTS take unit
 * prices and quantities as decimal numbers (e.g. 12.50, 1.5); credit amounts
 * are integer cents. Direct DB access via Drizzle (no HTTP self-calls).
 */
export function registerSalesReceiptTools(server: McpServer, ctx: AuthContext) {
  // ---------------------------------------------------------------- Sales receipts

  server.tool(
    "list_sales_receipts",
    "List cash-sale sales receipts with optional filters. A sales receipt settles immediately to a bank/deposit account and never touches Accounts Receivable. Amounts (subtotal, taxTotal, total) are in integer cents.",
    {
      status: z
        .enum(["draft", "paid", "void"])
        .optional()
        .describe("Filter by sales-receipt status"),
      contactId: z.string().optional().describe("Filter by customer contact UUID"),
      startDate: z.string().optional().describe("Filter by date from (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Filter by date to (YYYY-MM-DD)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of receipts to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(salesReceipt.organizationId, ctx.organizationId),
          notDeleted(salesReceipt.deletedAt),
        ];
        if (params.status) conditions.push(eq(salesReceipt.status, params.status));
        if (params.contactId) conditions.push(eq(salesReceipt.contactId, params.contactId));
        if (params.startDate) conditions.push(gte(salesReceipt.date, params.startDate));
        if (params.endDate) conditions.push(lte(salesReceipt.date, params.endDate));

        const offset = (params.page - 1) * params.limit;
        const receipts = await db.query.salesReceipt.findMany({
          where: and(...conditions),
          orderBy: desc(salesReceipt.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(salesReceipt)
          .where(and(...conditions));

        return { salesReceipts: receipts, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_sales_receipt",
    "Get a single sales receipt by ID with line items, contact, bank/deposit account, and journal entry. All amounts are in integer cents.",
    {
      salesReceiptId: z.string().describe("The UUID of the sales receipt"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.salesReceipt.findFirst({
          where: and(
            eq(salesReceipt.id, params.salesReceiptId),
            eq(salesReceipt.organizationId, ctx.organizationId),
            notDeleted(salesReceipt.deletedAt)
          ),
          with: {
            contact: true,
            lines: { with: { account: true, taxRate: true } },
            bankAccount: true,
            depositAccount: true,
            journalEntry: true,
          },
        });
        if (!found) throw new Error("Sales receipt not found");
        return { salesReceipt: found };
      })
  );

  server.tool(
    "create_sales_receipt",
    "Create a draft cash-sale sales receipt with line items. Unit prices and quantities are decimal numbers (e.g. 12.50, 1.5). discountPercent is basis points (1000 = 10%). Lines are tax-EXCLUSIVE — tax is added on top. The system calculates totals and assigns a receipt number. Use post_sales_receipt to post it to the ledger. Provide bankAccountId or depositAccountId for where the cash lands (can also be set at post time).",
    {
      contactId: z.string().describe("Customer contact UUID"),
      date: z.string().describe("Sale date (YYYY-MM-DD)"),
      reference: z.string().optional().describe("External reference"),
      notes: z.string().optional().describe("Notes"),
      currencyCode: z
        .string()
        .optional()
        .describe("Currency code; defaults to contact/org currency"),
      bankAccountId: z
        .string()
        .optional()
        .describe("Bank account UUID the cash lands in (preferred)"),
      depositAccountId: z
        .string()
        .optional()
        .describe("Deposit chart-account UUID, if not using a bank account"),
      lines: z
        .array(
          z.object({
            description: z.string().describe("Line item description"),
            quantity: z.number().optional().default(1).describe("Quantity (decimal)"),
            unitPrice: z
              .number()
              .optional()
              .default(0)
              .describe("Unit price (decimal, e.g. 12.50)"),
            accountId: z.string().optional().describe("Revenue account UUID"),
            taxRateId: z.string().optional().describe("Tax rate UUID"),
            discountPercent: z
              .number()
              .int()
              .min(0)
              .max(10000)
              .optional()
              .default(0)
              .describe("Discount in basis points (1000 = 10%)"),
            costCenterId: z.string().optional().describe("Cost center UUID"),
            projectId: z.string().optional().describe("Project UUID (job costing)"),
            inventoryItemId: z
              .string()
              .optional()
              .describe("Inventory item UUID; relieves stock and posts COGS when posted"),
            warehouseId: z
              .string()
              .optional()
              .describe("Warehouse UUID to issue stock from"),
          })
        )
        .min(1)
        .describe("Sales-receipt line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");
        await assertNotLocked(ctx.organizationId, params.date);

        const currencyCode = await resolveDocumentCurrency(
          ctx.organizationId,
          params.currencyCode,
          params.contactId
        );
        await checkMultiCurrency(ctx.organizationId, currencyCode);

        const receiptNumber = await getNextNumber(
          ctx.organizationId,
          "sales_receipt",
          "receipt_number",
          "SR"
        );

        const taxRateIds = params.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
        const ratesMap = await preloadTaxRates(taxRateIds);

        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const grossAmount = decimalToCents(l.quantity * l.unitPrice);
          const discountAmount = l.discountPercent
            ? Math.round((grossAmount * l.discountPercent) / 10000)
            : 0;
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
            discountPercent: l.discountPercent,
            taxAmount,
            amount,
            costCenterId: l.costCenterId ?? null,
            projectId: l.projectId ?? null,
            inventoryItemId: l.inventoryItemId ?? null,
            warehouseId: l.warehouseId ?? null,
            sortOrder: i,
          };
        });

        const taxTotal = processedLines.reduce((s, l) => s + l.taxAmount, 0);
        const total = subtotal + taxTotal;

        const [created] = await db
          .insert(salesReceipt)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            receiptNumber,
            date: params.date,
            reference: params.reference ?? null,
            notes: params.notes ?? null,
            subtotal,
            taxTotal,
            total,
            currencyCode,
            bankAccountId: params.bankAccountId ?? null,
            depositAccountId: params.depositAccountId ?? null,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(salesReceiptLine).values(
          processedLines.map((l) => ({ salesReceiptId: created.id, ...l }))
        );

        return { salesReceipt: created };
      })
  );

  server.tool(
    "post_sales_receipt",
    "Post a draft sales receipt to the ledger. Posts DR cash (the bank account's linked ledger account, the chosen deposit account, or Undeposited Funds 1250) / CR revenue per line / CR Output VAT 2200 — skipping Accounts Receivable — plus COGS for any stock lines. Sets status to 'paid'. Foreign-currency receipts require an exchange rate.",
    {
      salesReceiptId: z.string().describe("The UUID of the sales receipt to post"),
      bankAccountId: z
        .string()
        .optional()
        .describe("Override/set the bank account the cash lands in"),
      depositAccountId: z
        .string()
        .optional()
        .describe("Override/set the deposit chart account, if not using a bank account"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:invoices");

        const found = await db.query.salesReceipt.findFirst({
          where: and(
            eq(salesReceipt.id, params.salesReceiptId),
            eq(salesReceipt.organizationId, ctx.organizationId),
            notDeleted(salesReceipt.deletedAt)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Sales receipt not found");
        if (found.status !== "draft") throw new Error("Only draft sales receipts can be posted");

        await assertNotLocked(ctx.organizationId, found.date);

        const bankAccountId = params.bankAccountId ?? found.bankAccountId;
        const depositAccountId = params.depositAccountId ?? found.depositAccountId;

        let cashAccountId: string | null = null;
        if (bankAccountId) {
          const acct = await db.query.bankAccount.findFirst({
            where: and(
              eq(bankAccount.id, bankAccountId),
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt)
            ),
            columns: {
              id: true,
              accountName: true,
              accountType: true,
              currencyCode: true,
              chartAccountId: true,
            },
          });
          if (!acct) throw new Error("Bank account not found");
          // Connect the bank account to its ledger account automatically (older
          // accounts self-heal on first use) so posting never dead-ends.
          cashAccountId = await ensureBankLedgerAccount(ctx.organizationId, acct);
        } else if (depositAccountId) {
          const acct = await db.query.chartAccount.findFirst({
            where: and(
              eq(chartAccount.id, depositAccountId),
              eq(chartAccount.organizationId, ctx.organizationId)
            ),
            columns: { id: true },
          });
          if (!acct) throw new Error("Deposit account not found");
          cashAccountId = acct.id;
        }

        await assertBaseRateAvailable(ctx.organizationId, found.currencyCode, found.date);
        const { currency, rate, base } = await resolveBaseRate(
          ctx.organizationId,
          found.currencyCode,
          found.date
        );

        const updated = await db.transaction(async (tx) => {
          if (!cashAccountId) {
            const undeposited = await ensureControlAccount(
              ctx.organizationId,
              "undepositedFunds",
              base,
              tx
            );
            if (!undeposited) throw new Error("Could not resolve a cash account");
            cashAccountId = undeposited.id;
          }

          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: found.date,
              description: `Sales receipt ${found.receiptNumber}`,
              reference: found.receiptNumber,
              status: "posted",
              sourceType: "sales_receipt",
              sourceId: found.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          const lines: (typeof journalLine.$inferInsert)[] = [];
          for (const line of found.lines) {
            if (line.accountId && line.amount > 0) {
              lines.push({
                journalEntryId: entry.id,
                accountId: line.accountId,
                description: `Sales receipt ${found.receiptNumber}`,
                debitAmount: 0,
                creditAmount: line.amount,
              });
            }
          }
          if (found.taxTotal > 0) {
            const outputVat = await ensureControlAccount(
              ctx.organizationId,
              "outputVat",
              base,
              tx
            );
            if (outputVat) {
              lines.push({
                journalEntryId: entry.id,
                accountId: outputVat.id,
                description: `Tax on ${found.receiptNumber}`,
                debitAmount: 0,
                creditAmount: found.taxTotal,
              });
            }
          }
          const cashTotal = lines.reduce((s, l) => s + (l.creditAmount ?? 0), 0);
          if (cashTotal > 0) {
            lines.unshift({
              journalEntryId: entry.id,
              accountId: cashAccountId!,
              description: `Sales receipt ${found.receiptNumber}`,
              debitAmount: cashTotal,
              creditAmount: 0,
            });
            await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));
          }

          const stockLines = found.lines.filter((l) => l.inventoryItemId);
          if (stockLines.length > 0) {
            await createCogsJournalEntry(
              { organizationId: ctx.organizationId, userId: ctx.userId },
              {
                reference: found.receiptNumber,
                date: found.date,
                currencyCode: found.currencyCode,
                lines: stockLines.map((l) => ({
                  inventoryItemId: l.inventoryItemId as string,
                  quantity: l.quantity,
                  warehouseId: l.warehouseId,
                })),
              },
              tx
            );
          }

          const [row] = await tx
            .update(salesReceipt)
            .set({
              status: "paid",
              journalEntryId: entry.id,
              bankAccountId: bankAccountId ?? found.bankAccountId,
              depositAccountId: depositAccountId ?? found.depositAccountId,
              updatedAt: new Date(),
            })
            .where(eq(salesReceipt.id, found.id))
            .returning();
          return row;
        });

        return { salesReceipt: updated };
      })
  );

  server.tool(
    "void_sales_receipt",
    "Void a sales receipt. If it was posted, reverses its ledger entry (swapping debit/credit) and restocks any inventory it relieved; if still a draft, just marks it void.",
    {
      salesReceiptId: z.string().describe("The UUID of the sales receipt to void"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:invoices");

        const found = await db.query.salesReceipt.findFirst({
          where: and(
            eq(salesReceipt.id, params.salesReceiptId),
            eq(salesReceipt.organizationId, ctx.organizationId),
            notDeleted(salesReceipt.deletedAt)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Sales receipt not found");
        if (found.status === "void") throw new Error("Already voided");

        await assertNotLocked(ctx.organizationId, found.date);

        const updated = await db.transaction(async (tx) => {
          if (found.journalEntryId) {
            const original = await tx.query.journalEntry.findFirst({
              where: and(
                eq(journalEntry.id, found.journalEntryId),
                eq(journalEntry.organizationId, ctx.organizationId)
              ),
              with: { lines: true },
            });
            if (original && !original.reversedByEntryId) {
              const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
              const [reversal] = await tx
                .insert(journalEntry)
                .values({
                  organizationId: ctx.organizationId,
                  entryNumber,
                  date: found.date,
                  description: `Void sales receipt ${found.receiptNumber}`,
                  reference: found.receiptNumber,
                  status: "posted",
                  sourceType: "sales_receipt_void",
                  sourceId: found.id,
                  reversesEntryId: original.id,
                  postedAt: new Date(),
                  createdBy: ctx.userId,
                })
                .returning();
              if (original.lines.length > 0) {
                await tx.insert(journalLine).values(
                  original.lines.map((l) => ({
                    journalEntryId: reversal.id,
                    accountId: l.accountId,
                    description: `Void sales receipt ${found.receiptNumber}`,
                    debitAmount: l.creditAmount,
                    creditAmount: l.debitAmount,
                    currencyCode: l.currencyCode,
                    exchangeRate: l.exchangeRate,
                    costCenterId: l.costCenterId,
                    projectId: l.projectId,
                  }))
                );
              }
              await tx
                .update(journalEntry)
                .set({ reversedByEntryId: reversal.id, updatedAt: new Date() })
                .where(eq(journalEntry.id, original.id));
            }

            const stockLines = found.lines.filter((l) => l.inventoryItemId);
            if (stockLines.length > 0) {
              await createCogsJournalEntry(
                { organizationId: ctx.organizationId, userId: ctx.userId },
                {
                  reference: found.receiptNumber,
                  date: found.date,
                  currencyCode: found.currencyCode,
                  lines: stockLines.map((l) => ({
                    inventoryItemId: l.inventoryItemId as string,
                    quantity: l.quantity,
                    warehouseId: l.warehouseId,
                  })),
                },
                tx,
                { reverse: true }
              );
            }
          }

          const [row] = await tx
            .update(salesReceipt)
            .set({ status: "void", voidedAt: new Date(), updatedAt: new Date() })
            .where(eq(salesReceipt.id, found.id))
            .returning();
          return row;
        });

        return { salesReceipt: updated };
      })
  );

  // --------------------------------------------------------------- Customer credits

  server.tool(
    "list_customer_credits",
    "List customer credits (prepayments, deposits, overpayments held on account). Amounts (originalAmount, amountRemaining) are in integer cents.",
    {
      status: z
        .enum(["open", "applied", "refunded", "void"])
        .optional()
        .describe("Filter by credit status"),
      contactId: z.string().optional().describe("Filter by customer contact UUID"),
      startDate: z.string().optional().describe("Filter by date from (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Filter by date to (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Max 100"),
      page: z.number().int().min(1).optional().default(1).describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(customerCredit.organizationId, ctx.organizationId),
          notDeleted(customerCredit.deletedAt),
        ];
        if (params.status) conditions.push(eq(customerCredit.status, params.status));
        if (params.contactId) conditions.push(eq(customerCredit.contactId, params.contactId));
        if (params.startDate) conditions.push(gte(customerCredit.date, params.startDate));
        if (params.endDate) conditions.push(lte(customerCredit.date, params.endDate));

        const offset = (params.page - 1) * params.limit;
        const credits = await db.query.customerCredit.findMany({
          where: and(...conditions),
          orderBy: desc(customerCredit.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(customerCredit)
          .where(and(...conditions));

        return { customerCredits: credits, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_customer_credit",
    "Get a single customer credit by ID with contact and journal entry. Amounts are in integer cents.",
    {
      customerCreditId: z.string().describe("The UUID of the customer credit"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.customerCredit.findFirst({
          where: and(
            eq(customerCredit.id, params.customerCreditId),
            eq(customerCredit.organizationId, ctx.organizationId),
            notDeleted(customerCredit.deletedAt)
          ),
          with: { contact: true, journalEntry: true },
        });
        if (!found) throw new Error("Customer credit not found");
        return { customerCredit: found };
      })
  );

  server.tool(
    "create_customer_credit",
    "Record a customer prepayment, deposit, or overpayment received on account. The amount is in integer cents (e.g. 5000 = $50.00). Posts DR cash (the bank account's linked ledger account, or the chosen deposit account) / CR Customer Deposits 2410 immediately. Provide exactly one of bankAccountId or depositAccountId for where the money landed. The credit can later be applied to an invoice with apply_customer_credit.",
    {
      contactId: z.string().describe("Customer contact UUID"),
      date: z.string().describe("Date received (YYYY-MM-DD)"),
      amount: z.number().int().positive().describe("Credit amount in integer cents"),
      sourceType: z
        .enum(["prepayment", "overpayment", "credit_note"])
        .describe("What this credit represents"),
      currencyCode: z
        .string()
        .optional()
        .describe("Currency code; defaults to contact/org currency"),
      notes: z.string().optional().describe("Notes"),
      bankAccountId: z
        .string()
        .optional()
        .describe("Bank account UUID the money landed in (preferred)"),
      depositAccountId: z
        .string()
        .optional()
        .describe("Deposit chart-account UUID, if not using a bank account"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        await assertNotLocked(ctx.organizationId, params.date);

        const currencyCode = await resolveDocumentCurrency(
          ctx.organizationId,
          params.currencyCode,
          params.contactId
        );
        await checkMultiCurrency(ctx.organizationId, currencyCode);

        let cashAccountId: string | null = null;
        if (params.bankAccountId) {
          const acct = await db.query.bankAccount.findFirst({
            where: and(
              eq(bankAccount.id, params.bankAccountId),
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt)
            ),
            columns: {
              id: true,
              accountName: true,
              accountType: true,
              currencyCode: true,
              chartAccountId: true,
            },
          });
          if (!acct) throw new Error("Bank account not found");
          // Connect the bank account to its ledger account automatically (older
          // accounts self-heal on first use) so recording a credit never dead-ends.
          cashAccountId = await ensureBankLedgerAccount(ctx.organizationId, acct);
        } else if (params.depositAccountId) {
          const acct = await db.query.chartAccount.findFirst({
            where: and(
              eq(chartAccount.id, params.depositAccountId),
              eq(chartAccount.organizationId, ctx.organizationId)
            ),
            columns: { id: true },
          });
          if (!acct) throw new Error("Deposit account not found");
          cashAccountId = acct.id;
        } else {
          throw new Error("A bankAccountId or depositAccountId is required");
        }

        await assertBaseRateAvailable(ctx.organizationId, currencyCode, params.date);
        const { currency, rate, base } = await resolveBaseRate(
          ctx.organizationId,
          currencyCode,
          params.date
        );

        const created = await db.transaction(async (tx) => {
          const deposits = await ensureControlAccount(
            ctx.organizationId,
            "customerDeposits",
            base,
            tx
          );
          if (!deposits) throw new Error("Could not resolve the Customer Deposits account");

          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const description = `Customer ${params.sourceType} received`;
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: params.date,
              description,
              reference: params.sourceType,
              status: "posted",
              sourceType: "customer_credit",
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          const lines: (typeof journalLine.$inferInsert)[] = [
            {
              journalEntryId: entry.id,
              accountId: cashAccountId!,
              description,
              debitAmount: params.amount,
              creditAmount: 0,
            },
            {
              journalEntryId: entry.id,
              accountId: deposits.id,
              description,
              debitAmount: 0,
              creditAmount: params.amount,
            },
          ];
          await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

          const [row] = await tx
            .insert(customerCredit)
            .values({
              organizationId: ctx.organizationId,
              contactId: params.contactId,
              date: params.date,
              currencyCode,
              originalAmount: params.amount,
              amountRemaining: params.amount,
              sourceType: params.sourceType,
              status: "open",
              journalEntryId: entry.id,
              notes: params.notes ?? null,
              createdBy: ctx.userId,
            })
            .returning();
          return row;
        });

        return { customerCredit: created };
      })
  );

  server.tool(
    "apply_customer_credit",
    "Apply an open customer credit to an invoice. Moves the Customer Deposits 2410 liability onto the invoice: posts DR Customer Deposits 2410 / CR Accounts Receivable 1200, records the allocation, decrements the credit's remaining balance, and updates the invoice's paid/due amounts and status. amount is in integer cents and must not exceed the credit's remaining balance or the invoice's amount due. Credit and invoice currencies must match.",
    {
      customerCreditId: z.string().describe("The UUID of the customer credit"),
      invoiceId: z.string().describe("The UUID of the invoice to apply it to"),
      amount: z.number().int().positive().describe("Amount to apply, in integer cents"),
      date: z
        .string()
        .optional()
        .describe("Application/journal date (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");
        const applyDate = params.date || new Date().toISOString().split("T")[0];
        await assertNotLocked(ctx.organizationId, applyDate);

        const found = await db.query.customerCredit.findFirst({
          where: and(
            eq(customerCredit.id, params.customerCreditId),
            eq(customerCredit.organizationId, ctx.organizationId),
            notDeleted(customerCredit.deletedAt)
          ),
        });
        if (!found) throw new Error("Customer credit not found");
        if (found.status !== "open") throw new Error("Only open customer credits can be applied");
        if (params.amount > found.amountRemaining)
          throw new Error("Amount exceeds the credit's remaining balance");

        const foundInvoice = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        if (!foundInvoice) throw new Error("Invoice not found");
        if (foundInvoice.status === "draft" || foundInvoice.status === "void")
          throw new Error("Cannot apply a credit to this invoice status");
        if (foundInvoice.currencyCode !== found.currencyCode)
          throw new Error("Credit currency must match the invoice currency");
        if (params.amount > foundInvoice.amountDue)
          throw new Error("Amount exceeds the invoice amount due");

        await assertBaseRateAvailable(ctx.organizationId, found.currencyCode, applyDate);
        const { currency, rate, base } = await resolveBaseRate(
          ctx.organizationId,
          found.currencyCode,
          applyDate
        );

        const newRemaining = found.amountRemaining - params.amount;
        const creditStatus = newRemaining <= 0 ? "applied" : "open";
        const newAmountPaid = foundInvoice.amountPaid + params.amount;
        const newAmountDue = foundInvoice.total - newAmountPaid;
        const invoiceStatus = newAmountDue <= 0 ? "paid" : "partial";

        const paymentNumber = await getNextNumber(
          ctx.organizationId,
          "payment",
          "payment_number",
          "PAY"
        );

        const result = await db.transaction(async (tx) => {
          const arAccount = await findAccountByCode(ctx.organizationId, "1200", tx);
          if (!arAccount) throw new Error("Accounts Receivable account (1200) not found");
          const deposits = await ensureControlAccount(
            ctx.organizationId,
            "customerDeposits",
            base,
            tx
          );
          if (!deposits) throw new Error("Could not resolve the Customer Deposits account");

          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const description = `Apply customer credit to invoice ${foundInvoice.invoiceNumber}`;
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: applyDate,
              description,
              reference: foundInvoice.invoiceNumber,
              status: "posted",
              sourceType: "customer_credit_application",
              sourceId: found.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          const lines: (typeof journalLine.$inferInsert)[] = [
            {
              journalEntryId: entry.id,
              accountId: deposits.id,
              description,
              debitAmount: params.amount,
              creditAmount: 0,
            },
            {
              journalEntryId: entry.id,
              accountId: arAccount.id,
              description,
              debitAmount: 0,
              creditAmount: params.amount,
            },
          ];
          await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

          const [createdPayment] = await tx
            .insert(payment)
            .values({
              organizationId: ctx.organizationId,
              contactId: found.contactId,
              paymentNumber,
              type: "received",
              date: applyDate,
              amount: params.amount,
              method: "other",
              reference: foundInvoice.invoiceNumber,
              notes: `Customer credit applied to invoice ${foundInvoice.invoiceNumber}`,
              currencyCode: found.currencyCode,
              journalEntryId: entry.id,
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(paymentAllocation).values([
            {
              paymentId: createdPayment.id,
              documentType: "prepayment",
              documentId: found.id,
              amount: params.amount,
            },
            {
              paymentId: createdPayment.id,
              documentType: "invoice",
              documentId: params.invoiceId,
              amount: params.amount,
            },
          ]);

          const [updatedCredit] = await tx
            .update(customerCredit)
            .set({
              amountRemaining: Math.max(0, newRemaining),
              status: creditStatus,
              updatedAt: new Date(),
            })
            .where(eq(customerCredit.id, found.id))
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

          return { updatedCredit, updatedInvoice };
        });

        return {
          customerCredit: result.updatedCredit,
          invoice: result.updatedInvoice,
        };
      })
  );

  // ------------------------------------------------------------------ Bad debt

  server.tool(
    "write_off_invoice",
    "Write off an uncollectible invoice as bad debt. Removes the outstanding Accounts Receivable (1200) and recognises the loss for whatever is still due — direct method (default): DR Bad Debt Expense 6500 / CR AR 1200; allowance method: DR Allowance for Doubtful Accounts 1290 / CR AR 1200. Posts in the invoice currency, converted to base. Sets the invoice to void with a written-off marker and clears amount due. Cannot write off a draft, voided, fully paid, or already written-off invoice. Use recover_written_off_invoice if cash later arrives. Returns the updated invoice.",
    {
      invoiceId: z.string().describe("The UUID of the invoice to write off"),
      method: z
        .enum(["direct", "allowance"])
        .optional()
        .default("direct")
        .describe(
          "Loss side: 'direct' books Bad Debt Expense (6500); 'allowance' draws down Allowance for Doubtful Accounts (1290)."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:invoices");

        const found = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        if (!found) throw new Error("Invoice not found");

        // Don't post bad-debt entries into a locked/closed period.
        await assertNotLocked(ctx.organizationId, found.issueDate, ctx);

        if (found.writtenOffAt) throw new Error("Invoice already written off");
        if (found.status === "void") throw new Error("Cannot write off a voided invoice");
        if (found.status === "paid")
          throw new Error("Invoice is fully paid; nothing to write off");

        // Write off whatever is still outstanding (fall back to total for older
        // rows where amountDue was never populated).
        const amountDue =
          found.amountDue > 0 ? found.amountDue : found.total - found.amountPaid;
        if (amountDue <= 0) throw new Error("Nothing outstanding to write off");

        const { base, currency, rate } = await resolveBaseRate(
          ctx.organizationId,
          found.currencyCode,
          found.issueDate
        );

        const arAccount = await findAccountByCode(ctx.organizationId, "1200");
        if (!arAccount) throw new Error("Accounts Receivable account (1200) not found");

        // Loss side: direct → Bad Debt Expense (6500); allowance → Allowance for
        // Doubtful Accounts (1290) (the allowance was previously provided for).
        const lossAccount =
          params.method === "allowance"
            ? await ensureAccountByCode(
                ctx.organizationId,
                {
                  code: "1290",
                  name: "Allowance for Doubtful Accounts",
                  type: "asset",
                  subType: "current",
                },
                base
              )
            : await ensureAccountByCode(
                ctx.organizationId,
                {
                  code: "6500",
                  name: "Bad Debt Expense",
                  type: "expense",
                  subType: "operating",
                },
                base
              );
        if (!lossAccount) throw new Error("Could not resolve the bad-debt write-off account");

        const [updated] = await db.transaction(async (tx) => {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: found.issueDate,
              description: `Bad debt write-off for invoice ${found.invoiceNumber}`,
              reference: found.invoiceNumber,
              status: "posted",
              sourceType: "bad_debt_write_off",
              sourceId: found.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          const mk = (accountId: string, debit: number, credit: number) => ({
            journalEntryId: entry.id,
            accountId,
            description: `Bad debt write-off ${found.invoiceNumber}`,
            debitAmount: debit,
            creditAmount: credit,
          });

          // DR loss account / CR Accounts Receivable, converted document → base.
          await tx.insert(journalLine).values(
            toBaseLines(
              [mk(lossAccount.id, amountDue, 0), mk(arAccount.id, 0, amountDue)],
              currency,
              rate
            )
          );

          return tx
            .update(invoice)
            .set({
              status: "void",
              writtenOffAt: new Date(),
              amountDue: 0,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, params.invoiceId))
            .returning();
        });

        return { invoice: updated, amountWrittenOff: amountDue, method: params.method };
      })
  );

  server.tool(
    "recover_written_off_invoice",
    "Record cash recovered on an invoice previously written off as bad debt (direct method). Posts DR Bank GL (bankAccountCode, default 1100) / CR Bad Debt Recovered 4400 for the recovered amount in integer cents (defaults to the invoice total when omitted), in the invoice currency converted to base. Does not change the invoice status — it stays void/written-off — but records the recovery on the ledger. The invoice must already be written off. Returns the invoice and the recovered amount.",
    {
      invoiceId: z.string().describe("The UUID of the previously written-off invoice"),
      amount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Cash recovered in integer cents. Defaults to the invoice total when omitted."),
      bankAccountCode: z
        .string()
        .optional()
        .describe("Chart-of-accounts code of the bank account the cash landed in. Defaults to '1100'."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:invoices");

        const found = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        if (!found) throw new Error("Invoice not found");

        await assertNotLocked(ctx.organizationId, found.issueDate, ctx);

        if (!found.writtenOffAt)
          throw new Error("Invoice has not been written off; nothing to recover");

        const amount = params.amount ?? found.total;
        if (amount <= 0) throw new Error("Recovery amount must be positive");

        const { base, currency, rate } = await resolveBaseRate(
          ctx.organizationId,
          found.currencyCode,
          found.issueDate
        );

        // With no code given, fall back to the standard checking account,
        // creating it on demand so recovery never dead-ends. An explicitly
        // supplied code must already exist (don't fabricate a typo'd account).
        const bankCode = params.bankAccountCode || "1100";
        const bankAccount =
          (await findAccountByCode(ctx.organizationId, bankCode)) ??
          (!params.bankAccountCode
            ? await ensureAccountByCode(
                ctx.organizationId,
                { code: "1100", name: "Checking Account", type: "asset", subType: "bank" },
                base
              )
            : null);
        if (!bankAccount) throw new Error(`Bank account (${bankCode}) not found`);

        const recoveredAccount = await ensureAccountByCode(
          ctx.organizationId,
          {
            code: "4400",
            name: "Bad Debt Recovered",
            type: "revenue",
            subType: "non_operating",
          },
          base
        );
        if (!recoveredAccount)
          throw new Error("Could not resolve Bad Debt Recovered account (4400)");

        await db.transaction(async (tx) => {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: found.issueDate,
              description: `Bad debt recovery for invoice ${found.invoiceNumber}`,
              reference: found.invoiceNumber,
              status: "posted",
              sourceType: "bad_debt_recovery",
              sourceId: found.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          const mk = (accountId: string, debit: number, credit: number) => ({
            journalEntryId: entry.id,
            accountId,
            description: `Bad debt recovery ${found.invoiceNumber}`,
            debitAmount: debit,
            creditAmount: credit,
          });

          // DR Bank / CR Bad Debt Recovered, converted document → base currency.
          await tx.insert(journalLine).values(
            toBaseLines(
              [mk(bankAccount.id, amount, 0), mk(recoveredAccount.id, 0, amount)],
              currency,
              rate
            )
          );
        });

        return { invoice: found, recovered: amount };
      })
  );
}
