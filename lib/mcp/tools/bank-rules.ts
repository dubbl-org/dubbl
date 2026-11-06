import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { bankRule, bankTransaction, bankAccount } from "@/lib/db/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { autoReconcileBankTransactions } from "@/lib/api/bank-auto-reconcile";
import {
  applyBankRulesToAccount,
  applyBankRulesToTransaction,
  getBankRuleSuggestions,
  loadActiveBankRules,
} from "@/lib/api/bank-rules";
import { decideRuleOutcome } from "@/lib/banking/rule-outcome";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerBankRuleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_bank_rules",
    "List bank rules for auto-categorizing imported transactions. Supports filtering by active status and pagination.",
    {
      isActive: z
        .boolean()
        .optional()
        .describe("Filter by active/inactive status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of rules to return (max 100)"),
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
          eq(bankRule.organizationId, ctx.organizationId),
          notDeleted(bankRule.deletedAt),
        ];

        if (params.isActive !== undefined) {
          conditions.push(eq(bankRule.isActive, params.isActive));
        }

        const offset = (params.page - 1) * params.limit;

        const rules = await db.query.bankRule.findMany({
          where: and(...conditions),
          orderBy: desc(bankRule.priority),
          limit: params.limit,
          offset,
          with: {
            account: true,
            contact: true,
            taxRate: true,
          },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(bankRule)
          .where(and(...conditions));

        return {
          rules,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_bank_rule",
    "Create a new bank rule to auto-categorize imported bank transactions. Rules match on transaction description or reference fields.",
    {
      name: z.string().describe("Rule name for identification"),
      matchField: z
        .enum(["description", "reference"])
        .describe("Transaction field to match against"),
      matchType: z
        .enum(["contains", "equals", "starts_with", "ends_with"])
        .describe("How to match the field value"),
      matchValue: z.string().describe("Value to match against the field"),
      accountId: z
        .string()
        .optional()
        .describe("UUID of the chart account to assign"),
      contactId: z
        .string()
        .optional()
        .describe("UUID of the contact to assign"),
      taxRateId: z
        .string()
        .optional()
        .describe("UUID of the tax rate to assign"),
      priority: z
        .number()
        .int()
        .optional()
        .default(0)
        .describe("Rule priority - higher values are checked first"),
      autoReconcile: z
        .boolean()
        .optional()
        .default(false)
        .describe("Categorize matching transactions automatically: when true (and accountId is set), a match POSTS the categorization journal entry and marks the line reconciled, like categorize_bank_transaction. When false, the rule only fills in the account / contact / tax rate as a suggestion."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bank-rules");

        const [created] = await db
          .insert(bankRule)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            matchField: params.matchField,
            matchType: params.matchType,
            matchValue: params.matchValue,
            accountId: params.accountId ?? null,
            contactId: params.contactId ?? null,
            taxRateId: params.taxRateId ?? null,
            priority: params.priority,
            autoReconcile: params.autoReconcile,
          })
          .returning();

        return { rule: created };
      })
  );

  server.tool(
    "update_bank_rule",
    "Update an existing bank rule. Only provided fields are updated.",
    {
      ruleId: z.string().describe("The UUID of the bank rule to update"),
      name: z.string().optional().describe("New rule name"),
      matchField: z
        .enum(["description", "reference"])
        .optional()
        .describe("New match field"),
      matchType: z
        .enum(["contains", "equals", "starts_with", "ends_with"])
        .optional()
        .describe("New match type"),
      matchValue: z.string().optional().describe("New match value"),
      accountId: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the chart account to assign, or null to clear"),
      contactId: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the contact to assign, or null to clear"),
      taxRateId: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the tax rate to assign, or null to clear"),
      priority: z.number().int().optional().describe("New priority value"),
      autoReconcile: z
        .boolean()
        .optional()
        .describe("Categorize matching transactions automatically: true posts the categorization journal entry for each match (needs accountId); false only suggests the category"),
      isActive: z.boolean().optional().describe("Enable or disable the rule"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bank-rules");

        const existing = await db.query.bankRule.findFirst({
          where: and(
            eq(bankRule.id, params.ruleId),
            eq(bankRule.organizationId, ctx.organizationId),
            notDeleted(bankRule.deletedAt)
          ),
        });

        if (!existing) throw new Error("Bank rule not found");

        const { ruleId, ...updates } = params;
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        const [updated] = await db
          .update(bankRule)
          .set(cleanUpdates)
          .where(eq(bankRule.id, ruleId))
          .returning();

        return { rule: updated };
      })
  );

  server.tool(
    "delete_bank_rule",
    "Soft-delete a bank rule by ID. The rule will no longer be applied to new transactions.",
    {
      ruleId: z.string().describe("The UUID of the bank rule to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bank-rules");

        const existing = await db.query.bankRule.findFirst({
          where: and(
            eq(bankRule.id, params.ruleId),
            eq(bankRule.organizationId, ctx.organizationId),
            notDeleted(bankRule.deletedAt)
          ),
        });

        if (!existing) throw new Error("Bank rule not found");

        const [deleted] = await db
          .update(bankRule)
          .set(softDelete())
          .where(eq(bankRule.id, params.ruleId))
          .returning();

        return { rule: deleted };
      })
  );

  server.tool(
    "get_bank_rule_suggestions",
    "Suggest new bank rules from repeat categorizations: bank line descriptions the user has categorized (posted) to the same account at least twice, leaving out anything an active rule already matches. Each suggestion gives a 'contains' keyword on the description (matchValue), the account it was categorized to (accountId, accountName, accountCode), how many lines it covers (occurrences) and a sampleDescription. Pass a suggestion's matchField / matchType / matchValue / accountId to create_bank_rule to turn it into a rule.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Number of suggestions to return (max 50)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const suggestions = await getBankRuleSuggestions(ctx.organizationId, params.limit);
        return { suggestions };
      })
  );

  server.tool(
    "apply_bank_rules",
    "Run the org's active bank rules over bank lines that are still to do (status 'unreconciled' with no category yet), the same engine statement imports use. Per matched line: a split rule, or a rule with autoReconcile=true and a single account, POSTS the categorization journal entry (exactly like categorize_bank_transaction) and marks the line reconciled; any other match only fills in the rule's account / contact / tax rate as a suggestion and leaves the line to do. A line is never marked reconciled without a journal entry: lines dated in a locked period or missing an exchange rate stay as suggestions (counted in skipped). Returns per-account and total counts: applied (lines a rule matched), reconciled (posted), split, skipped.",
    {
      bankAccountId: z
        .string()
        .optional()
        .describe("UUID of one bank account to run the rules on. Omit to run them on every bank account in the organization."),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, only lists which to-do lines each rule would match (and whether it would post or just suggest) without changing anything"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const accounts = await db
          .select({ id: bankAccount.id, accountName: bankAccount.accountName })
          .from(bankAccount)
          .where(
            and(
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt),
              params.bankAccountId ? eq(bankAccount.id, params.bankAccountId) : undefined
            )
          );

        if (params.bankAccountId && accounts.length === 0) {
          throw new Error("Bank account not found");
        }

        if (params.dryRun) {
          const rules = await loadActiveBankRules(ctx.organizationId);
          if (rules.length === 0) {
            return { matched: 0, dryRun: true, matches: [], message: "No active rules found" };
          }
          const matches: Array<{
            transactionId: string;
            bankAccountId: string;
            description: string;
            amount: number;
            ruleName: string;
            outcome: "split" | "post" | "suggest";
          }> = [];
          for (const acct of accounts) {
            const lines = await db.query.bankTransaction.findMany({
              where: and(
                eq(bankTransaction.bankAccountId, acct.id),
                eq(bankTransaction.status, "unreconciled"),
                isNull(bankTransaction.accountId)
              ),
            });
            for (const line of lines) {
              const assignment = applyBankRulesToTransaction(rules, line);
              if (!assignment) continue;
              matches.push({
                transactionId: line.id,
                bankAccountId: acct.id,
                description: line.description,
                amount: line.amount,
                ruleName: assignment.ruleName,
                outcome: decideRuleOutcome(assignment, true),
              });
            }
          }
          return { matched: matches.length, dryRun: true, matches };
        }

        const results = [];
        const totals = { applied: 0, reconciled: 0, split: 0, skipped: 0 };
        for (const acct of accounts) {
          const result = await applyBankRulesToAccount(ctx.organizationId, acct.id, ctx.userId);
          totals.applied += result.applied;
          totals.reconciled += result.reconciled;
          totals.split += result.split;
          totals.skipped += result.skipped;
          if (result.applied > 0) {
            results.push({ bankAccountId: acct.id, accountName: acct.accountName, ...result });
          }
        }

        return { ...totals, dryRun: false, accounts: results };
      })
  );

  server.tool(
    "auto_reconcile_bank_transactions",
    "Automatically link unreconciled bank lines to ALREADY-POSTED cash journal entries (e.g. payments recorded manually) that move a bank ledger account and aren't already linked, by fuzzy-matching amount/date/description. Does NOT touch open invoices/bills — reconciling those means recording a payment, which must be done explicitly via match_to_invoice / match_to_bill. Returns counts of checked, reconciled, and skipped transactions.",
    {
      bankAccountId: z
        .string()
        .optional()
        .describe("UUID of a specific bank account to scope reconciliation to"),
      confidenceThreshold: z
        .number()
        .int()
        .min(70)
        .max(100)
        .optional()
        .default(85)
        .describe("Minimum confidence score (70-100) to auto-reconcile a match. Default 85."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bank-rules");

        const result = await autoReconcileBankTransactions(ctx.organizationId, {
          bankAccountId: params.bankAccountId,
          confidenceThreshold: params.confidenceThreshold,
        });

        return result;
      })
  );

  server.tool(
    "set_bank_balance_alert",
    "Set or clear the low balance alert threshold for a bank account (the 'Low balance alert' field in the bank account's Settings tab). A daily check sends a 'Low bank balance' notification to org owners and admins while the balance is below the threshold, at most once a day per account. Amount in cents. Returns { bankAccountId, accountName, lowBalanceThreshold, currentBalance } (cents).",
    {
      bankAccountId: z
        .string()
        .describe("UUID of the bank account"),
      threshold: z
        .number()
        .int()
        .min(0)
        .nullable()
        .describe("Low balance threshold in cents (e.g. 100000 = $1000.00). Set to null to clear the alert."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Same permission as editing the bank account in the app
        requireRole(ctx, "manage:banking");

        const account = await db.query.bankAccount.findFirst({
          where: and(
            eq(bankAccount.id, params.bankAccountId),
            eq(bankAccount.organizationId, ctx.organizationId),
            notDeleted(bankAccount.deletedAt)
          ),
        });

        if (!account) throw new Error("Bank account not found");

        const [updated] = await db
          .update(bankAccount)
          .set({ lowBalanceThreshold: params.threshold })
          .where(eq(bankAccount.id, params.bankAccountId))
          .returning();

        return {
          bankAccountId: updated.id,
          accountName: updated.accountName,
          lowBalanceThreshold: updated.lowBalanceThreshold,
          currentBalance: updated.balance,
        };
      })
  );
}
