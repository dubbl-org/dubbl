import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  chartAccount,
  journalLine,
  journalEntry,
  taxRate,
  taxComponent,
  inventoryItem,
  assetCategory,
  fixedAsset,
  contact,
  bankAccount,
  bankTransaction,
  bankRule,
  expenseItem,
  budgetLine,
  accrualSchedule,
  revenueSchedule,
  recurringTemplateLine,
  loan,
  invoiceLine,
  quoteLine,
  creditNoteLine,
  billLine,
  purchaseOrderLine,
  debitNoteLine,
} from "@/lib/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { syncSystemAccounts } from "@/lib/db/system-accounts";
import {
  resolveSpecialAccount,
  SPECIAL_CATEGORY_ROLES,
  SPECIAL_CATEGORY_RESOLUTION,
} from "@/lib/banking/special-categories";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerAccountTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_accounts",
    "List all chart of accounts (categories) for the organization. Returns account code, name, type (asset/liability/equity/revenue/expense), active status, and isSystem (true = a built-in default category that can't be renamed or deleted). Built-in defaults come from the code-owned template and are kept continuously in sync, so newly added defaults appear here automatically.",
    {
      type: z
        .enum(["asset", "liability", "equity", "revenue", "expense"])
        .optional()
        .describe("Filter by account type"),
      activeOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe("Only return active accounts (default: true)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Bring the org's built-in default categories up to date with the
        // code-owned template before listing (best-effort).
        try {
          await syncSystemAccounts(ctx.organizationId);
        } catch {
          // non-fatal
        }

        const conditions = [
          eq(chartAccount.organizationId, ctx.organizationId),
          isNull(chartAccount.deletedAt),
        ];

        const accounts = await db.query.chartAccount.findMany({
          where: and(...conditions),
          orderBy: chartAccount.code,
        });

        let result = accounts;
        if (params.type) {
          result = result.filter((a) => a.type === params.type);
        }
        if (params.activeOnly) {
          result = result.filter((a) => a.isActive);
        }

        return { accounts: result, total: result.length };
      })
  );

  server.tool(
    "get_account",
    "Get a single account by ID with its balance calculated from posted journal entries. Returns account details, total debits, total credits, and net balance in cents.",
    {
      accountId: z.string().describe("The UUID of the account"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const account = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, params.accountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });

        if (!account) throw new Error("Account not found");

        // Calculate balance from posted entries
        const ledger = await db
          .select({
            debit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
            credit: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
          })
          .from(journalLine)
          .innerJoin(
            journalEntry,
            and(
              eq(journalLine.journalEntryId, journalEntry.id),
              eq(journalEntry.status, "posted")
            )
          )
          .where(eq(journalLine.accountId, params.accountId));

        const totalDebits = Number(ledger[0]?.debit ?? 0);
        const totalCredits = Number(ledger[0]?.credit ?? 0);
        const isDebitNormal = ["asset", "expense"].includes(account.type);
        const balance = isDebitNormal
          ? totalDebits - totalCredits
          : totalCredits - totalDebits;

        return {
          account: { ...account, totalDebits, totalCredits, balance },
        };
      })
  );

  server.tool(
    "create_account",
    "Create a new chart of accounts entry. Account code must be unique within the organization. Type determines the account's normal balance (asset/expense = debit, liability/equity/revenue = credit). Optionally sets a default tax rate (applied to lines coded to this account), a reporting code, and a tax-disallowed percentage.",
    {
      code: z.string().describe("Unique account code (e.g. '1000')"),
      name: z.string().describe("Account name (e.g. 'Cash')"),
      type: z
        .enum(["asset", "liability", "equity", "revenue", "expense"])
        .describe("Account type"),
      subType: z.string().optional().describe("Account sub-type"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code (default: USD)"),
      description: z.string().optional().describe("Account description"),
      defaultTaxRateId: z
        .string()
        .optional()
        .describe(
          "UUID of the tax rate to default onto lines coded to this account. Must belong to the organization."
        ),
      reportingCode: z
        .string()
        .optional()
        .describe("Optional reporting/report-code mapping for report packs"),
      taxDisallowedPercent: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .optional()
        .describe(
          "Portion of activity that is tax-disallowable for income tax, in basis points (10000 = 100%). Defaults to 0."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");

        const existing = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.organizationId, ctx.organizationId),
            eq(chartAccount.code, params.code)
          ),
        });
        if (existing) throw new Error("Account code already exists");

        // Validate the default tax rate belongs to this org (if supplied).
        if (params.defaultTaxRateId) {
          const rate = await db.query.taxRate.findFirst({
            where: and(
              eq(taxRate.id, params.defaultTaxRateId),
              eq(taxRate.organizationId, ctx.organizationId)
            ),
          });
          if (!rate) throw new Error("Tax rate not found");
        }

        const [account] = await db
          .insert(chartAccount)
          .values({
            organizationId: ctx.organizationId,
            code: params.code,
            name: params.name,
            type: params.type,
            subType: params.subType ?? null,
            currencyCode: params.currencyCode,
            description: params.description ?? null,
            defaultTaxRateId: params.defaultTaxRateId ?? null,
            reportingCode: params.reportingCode ?? null,
            ...(params.taxDisallowedPercent !== undefined
              ? { taxDisallowedPercent: params.taxDisallowedPercent }
              : {}),
          })
          .returning();

        return { account };
      })
  );

  server.tool(
    "update_account",
    "Update an existing account (category). Sub-type, active status, description, default tax rate, reporting code, and tax-disallowed percentage can be changed; code and name can be changed only for custom accounts. Account type cannot be changed after creation. Built-in/system categories (isSystem = true) cannot be renamed, recoded, retyped, or deleted — create a custom account instead.",
    {
      accountId: z.string().describe("The UUID of the account to update"),
      code: z.string().optional().describe("New account code"),
      name: z.string().optional().describe("New account name"),
      subType: z.string().optional().describe("New sub-type"),
      isActive: z.boolean().optional().describe("Set active/inactive"),
      description: z.string().optional().describe("New description"),
      defaultTaxRateId: z
        .string()
        .nullable()
        .optional()
        .describe(
          "UUID of the tax rate to default onto lines coded to this account (must belong to the org), or null to clear."
        ),
      reportingCode: z
        .string()
        .nullable()
        .optional()
        .describe("Reporting/report-code mapping, or null to clear"),
      taxDisallowedPercent: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .optional()
        .describe(
          "Portion of activity tax-disallowable for income tax, in basis points (10000 = 100%)."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");

        const { accountId, ...updates } = params;

        const existing = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, accountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!existing) throw new Error("Account not found");

        // Built-in/system categories are locked: their identity (name/code)
        // can't be changed. Usage settings stay editable.
        if (existing.isSystem) {
          if (updates.name !== undefined && updates.name !== existing.name) {
            throw new Error("Cannot rename a built-in category — create a custom account instead");
          }
          if (updates.code !== undefined && updates.code !== existing.code) {
            throw new Error("Cannot recode a built-in category — create a custom account instead");
          }
        }

        // Validate the default tax rate belongs to this org (if supplied).
        if (updates.defaultTaxRateId) {
          const rate = await db.query.taxRate.findFirst({
            where: and(
              eq(taxRate.id, updates.defaultTaxRateId),
              eq(taxRate.organizationId, ctx.organizationId)
            ),
          });
          if (!rate) throw new Error("Tax rate not found");
        }

        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        const [updated] = await db
          .update(chartAccount)
          .set(cleanUpdates)
          .where(
            and(
              eq(chartAccount.id, accountId),
              eq(chartAccount.organizationId, ctx.organizationId)
            )
          )
          .returning();

        if (!updated) throw new Error("Account not found");
        return { account: updated };
      })
  );

  server.tool(
    "delete_account",
    "Delete an account. Fails if the account has any journal line entries, or if it is a system control account (AR/AP/bank/tax/retained earnings). This is a permanent deletion, not a soft delete.",
    {
      accountId: z.string().describe("The UUID of the account to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");

        const account = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, params.accountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!account) throw new Error("Account not found");

        // System control accounts cannot be deleted (E8a).
        if (account.isSystem) {
          throw new Error("Cannot delete a system account");
        }

        const lines = await db.query.journalLine.findFirst({
          where: eq(journalLine.accountId, params.accountId),
        });
        if (lines) {
          throw new Error("Cannot delete account with existing transactions");
        }

        const [deleted] = await db
          .delete(chartAccount)
          .where(
            and(
              eq(chartAccount.id, params.accountId),
              eq(chartAccount.organizationId, ctx.organizationId)
            )
          )
          .returning();

        if (!deleted) throw new Error("Account not found");
        return { success: true };
      })
  );

  server.tool(
    "merge_accounts",
    "Merge one chart-of-accounts entry into another. Repoints all financial and configuration references (journal lines, tax components, document lines, contact/bank/inventory/fixed-asset/budget/accrual/revenue/recurring/loan account mappings) from the source account to the target, then soft-deletes (archives) the source. Both accounts must belong to the organization and share the same account type. This is irreversible: balances and history move to the target account.",
    {
      sourceAccountId: z
        .string()
        .describe("UUID of the account to merge from (will be archived)"),
      targetAccountId: z
        .string()
        .describe("UUID of the account to merge into (keeps all activity)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");

        const { sourceAccountId, targetAccountId } = params;
        if (sourceAccountId === targetAccountId) {
          throw new Error("Cannot merge an account into itself");
        }

        const source = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, sourceAccountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!source) throw new Error("Source account not found");
        if (source.deletedAt) {
          throw new Error("Source account has already been merged or deleted");
        }

        const target = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, targetAccountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!target) throw new Error("Target account not found");
        if (target.deletedAt) throw new Error("Target account has been deleted");

        // Same-type guard: merging across types would corrupt the trial balance.
        if (source.type !== target.type) {
          throw new Error("Accounts must be the same type to merge");
        }

        await db.transaction(async (tx) => {
          const src = sourceAccountId;
          const tgt = targetAccountId;

          // Core ledger + tax mappings (the required minimum).
          await tx
            .update(journalLine)
            .set({ accountId: tgt })
            .where(eq(journalLine.accountId, src));
          await tx
            .update(taxComponent)
            .set({ accountId: tgt })
            .where(eq(taxComponent.accountId, src));

          // Document lines.
          await tx
            .update(invoiceLine)
            .set({ accountId: tgt })
            .where(eq(invoiceLine.accountId, src));
          await tx
            .update(quoteLine)
            .set({ accountId: tgt })
            .where(eq(quoteLine.accountId, src));
          await tx
            .update(creditNoteLine)
            .set({ accountId: tgt })
            .where(eq(creditNoteLine.accountId, src));
          await tx
            .update(billLine)
            .set({ accountId: tgt })
            .where(eq(billLine.accountId, src));
          await tx
            .update(purchaseOrderLine)
            .set({ accountId: tgt })
            .where(eq(purchaseOrderLine.accountId, src));
          await tx
            .update(debitNoteLine)
            .set({ accountId: tgt })
            .where(eq(debitNoteLine.accountId, src));
          await tx
            .update(expenseItem)
            .set({ accountId: tgt })
            .where(eq(expenseItem.accountId, src));

          // Bank feed + rules + transactions.
          await tx
            .update(bankAccount)
            .set({ chartAccountId: tgt })
            .where(eq(bankAccount.chartAccountId, src));
          await tx
            .update(bankTransaction)
            .set({ accountId: tgt })
            .where(eq(bankTransaction.accountId, src));
          await tx
            .update(bankRule)
            .set({ accountId: tgt })
            .where(eq(bankRule.accountId, src));

          // Contact default mappings.
          await tx
            .update(contact)
            .set({ defaultRevenueAccountId: tgt })
            .where(eq(contact.defaultRevenueAccountId, src));
          await tx
            .update(contact)
            .set({ defaultExpenseAccountId: tgt })
            .where(eq(contact.defaultExpenseAccountId, src));

          // Inventory item account mappings.
          await tx
            .update(inventoryItem)
            .set({ costAccountId: tgt })
            .where(eq(inventoryItem.costAccountId, src));
          await tx
            .update(inventoryItem)
            .set({ revenueAccountId: tgt })
            .where(eq(inventoryItem.revenueAccountId, src));
          await tx
            .update(inventoryItem)
            .set({ inventoryAccountId: tgt })
            .where(eq(inventoryItem.inventoryAccountId, src));

          // Fixed asset category + asset account mappings.
          await tx
            .update(assetCategory)
            .set({ assetAccountId: tgt })
            .where(eq(assetCategory.assetAccountId, src));
          await tx
            .update(assetCategory)
            .set({ depreciationAccountId: tgt })
            .where(eq(assetCategory.depreciationAccountId, src));
          await tx
            .update(assetCategory)
            .set({ accumulatedDepAccountId: tgt })
            .where(eq(assetCategory.accumulatedDepAccountId, src));
          await tx
            .update(assetCategory)
            .set({ cwipAccountId: tgt })
            .where(eq(assetCategory.cwipAccountId, src));

          await tx
            .update(fixedAsset)
            .set({ assetAccountId: tgt })
            .where(eq(fixedAsset.assetAccountId, src));
          await tx
            .update(fixedAsset)
            .set({ depreciationAccountId: tgt })
            .where(eq(fixedAsset.depreciationAccountId, src));
          await tx
            .update(fixedAsset)
            .set({ accumulatedDepAccountId: tgt })
            .where(eq(fixedAsset.accumulatedDepAccountId, src));
          await tx
            .update(fixedAsset)
            .set({ cwipAccountId: tgt })
            .where(eq(fixedAsset.cwipAccountId, src));
          await tx
            .update(fixedAsset)
            .set({ revaluationReserveAccountId: tgt })
            .where(eq(fixedAsset.revaluationReserveAccountId, src));
          await tx
            .update(fixedAsset)
            .set({ impairmentExpenseAccountId: tgt })
            .where(eq(fixedAsset.impairmentExpenseAccountId, src));

          // Planning / scheduling tables.
          await tx
            .update(budgetLine)
            .set({ accountId: tgt })
            .where(eq(budgetLine.accountId, src));
          await tx
            .update(accrualSchedule)
            .set({ accountId: tgt })
            .where(eq(accrualSchedule.accountId, src));
          await tx
            .update(accrualSchedule)
            .set({ reverseAccountId: tgt })
            .where(eq(accrualSchedule.reverseAccountId, src));
          await tx
            .update(revenueSchedule)
            .set({ deferredRevenueAccountId: tgt })
            .where(eq(revenueSchedule.deferredRevenueAccountId, src));
          await tx
            .update(revenueSchedule)
            .set({ revenueAccountId: tgt })
            .where(eq(revenueSchedule.revenueAccountId, src));
          await tx
            .update(recurringTemplateLine)
            .set({ accountId: tgt })
            .where(eq(recurringTemplateLine.accountId, src));
          await tx
            .update(loan)
            .set({ principalAccountId: tgt })
            .where(eq(loan.principalAccountId, src));
          await tx
            .update(loan)
            .set({ interestAccountId: tgt })
            .where(eq(loan.interestAccountId, src));

          // Soft-delete / archive the source.
          await tx
            .update(chartAccount)
            .set({ deletedAt: new Date(), isActive: false })
            .where(
              and(
                eq(chartAccount.id, src),
                eq(chartAccount.organizationId, ctx.organizationId)
              )
            );
        });

        return { success: true, sourceAccountId, targetAccountId };
      })
  );

  server.tool(
    "get_special_category_account",
    "Resolve a plain-language money-movement behavior to the org's correct chart account, so you can then categorize a bank transaction to it. Built-in categories are ensured first (added if missing), so this works for any org/country even when the localized account code differs. Roles: owner_director_loan (money the owner/director lends the business, in or repaid — a liability; interest is always separate, so a 0% loan needs no interest line), capital_introduced (money the owner puts in — equity), owner_drawings (money the owner takes out — equity, never an expense), dividends_paid (company profit distribution — equity), reimbursements_payable (repay someone for a business cost they paid — clears the liability), tax_payable (pay the tax office; clears the VAT/sales-tax liability), suspense (park a line to sort later). Returns the account { id, code, name, type }. This only records money on the right account; it does not enforce country tax rules.",
    {
      role: z
        .enum(SPECIAL_CATEGORY_ROLES as [string, ...string[]])
        .describe("The money-movement behavior to resolve to an account"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Ensure the built-in categories exist for this org first.
        try {
          await syncSystemAccounts(ctx.organizationId);
        } catch {
          // non-fatal: resolve against whatever exists
        }

        const accounts = await db.query.chartAccount.findMany({
          where: and(
            eq(chartAccount.organizationId, ctx.organizationId),
            isNull(chartAccount.deletedAt)
          ),
          orderBy: chartAccount.code,
        });

        const role = params.role as keyof typeof SPECIAL_CATEGORY_RESOLUTION;
        const match = resolveSpecialAccount(role, accounts);
        if (!match) {
          throw new Error(
            `No '${SPECIAL_CATEGORY_RESOLUTION[role].label}' account exists for this organization`
          );
        }

        return {
          role,
          account: {
            id: match.id,
            code: match.code,
            name: match.name,
            type: match.type,
          },
        };
      })
  );
}
