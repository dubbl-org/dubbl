import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { bankRule, bankTransaction } from "@/lib/db/schema";
import { eq, and, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
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
        .describe("Whether to automatically reconcile matching transactions"),
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
        .describe("Whether to automatically reconcile matching transactions"),
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
    "Analyze categorized bank transactions to suggest new rule patterns. Finds common description patterns among transactions that already have a category account assigned. Returns top suggestions sorted by frequency.",
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
        const { bankAccount } = await import("@/lib/db/schema");

        // Get org's bank account IDs
        const orgAccounts = await db
          .select({ id: bankAccount.id })
          .from(bankAccount)
          .where(
            and(
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt)
            )
          );

        const accountIds = orgAccounts.map((a) => a.id);
        if (accountIds.length === 0) {
          return { suggestions: [], message: "No bank accounts found" };
        }

        // Find patterns in categorized transactions
        const suggestions = await db
          .select({
            description: bankTransaction.description,
            accountId: bankTransaction.accountId,
            contactId: bankTransaction.contactId,
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(bankTransaction)
          .where(
            and(
              sql`${bankTransaction.bankAccountId} IN (${sql.join(
                accountIds.map((id) => sql`${id}`),
                sql`, `
              )})`,
              isNotNull(bankTransaction.accountId)
            )
          )
          .groupBy(
            bankTransaction.description,
            bankTransaction.accountId,
            bankTransaction.contactId
          )
          .orderBy(sql`count(*) DESC`)
          .limit(params.limit);

        return {
          suggestions: suggestions.map((s) => ({
            matchField: "description" as const,
            matchType: "contains" as const,
            matchValue: s.description,
            accountId: s.accountId,
            contactId: s.contactId,
            transactionCount: s.count,
          })),
        };
      })
  );

  server.tool(
    "apply_bank_rules",
    "Apply all active bank rules to uncategorized transactions. Matches rules against transaction descriptions/references and updates matching transactions with the rule's account, contact, and tax rate. Returns the number of transactions updated.",
    {
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns matches without applying changes"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { bankAccount } = await import("@/lib/db/schema");

        // Get active rules ordered by priority
        const rules = await db.query.bankRule.findMany({
          where: and(
            eq(bankRule.organizationId, ctx.organizationId),
            eq(bankRule.isActive, true),
            notDeleted(bankRule.deletedAt)
          ),
          orderBy: desc(bankRule.priority),
        });

        if (rules.length === 0) {
          return { matched: 0, updated: 0, message: "No active rules found" };
        }

        // Get org's bank account IDs
        const orgAccounts = await db
          .select({ id: bankAccount.id })
          .from(bankAccount)
          .where(
            and(
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt)
            )
          );

        const accountIds = orgAccounts.map((a) => a.id);
        if (accountIds.length === 0) {
          return { matched: 0, updated: 0, message: "No bank accounts found" };
        }

        // Get uncategorized transactions
        const uncategorized = await db
          .select()
          .from(bankTransaction)
          .where(
            and(
              sql`${bankTransaction.bankAccountId} IN (${sql.join(
                accountIds.map((id) => sql`${id}`),
                sql`, `
              )})`,
              isNull(bankTransaction.accountId)
            )
          );

        let matched = 0;
        let updated = 0;
        const matches: Array<{
          transactionId: string;
          ruleName: string;
          description: string;
        }> = [];

        for (const tx of uncategorized) {
          for (const rule of rules) {
            const fieldValue =
              rule.matchField === "reference"
                ? (tx.reference ?? "")
                : tx.description;
            const value = fieldValue.toLowerCase();
            const match = rule.matchValue.toLowerCase();

            let isMatch = false;
            switch (rule.matchType) {
              case "contains":
                isMatch = value.includes(match);
                break;
              case "equals":
                isMatch = value === match;
                break;
              case "starts_with":
                isMatch = value.startsWith(match);
                break;
              case "ends_with":
                isMatch = value.endsWith(match);
                break;
            }

            if (isMatch) {
              matched++;
              matches.push({
                transactionId: tx.id,
                ruleName: rule.name,
                description: tx.description,
              });

              if (!params.dryRun) {
                const setValues: Record<string, unknown> = {};
                if (rule.accountId) setValues.accountId = rule.accountId;
                if (rule.contactId) setValues.contactId = rule.contactId;
                if (rule.taxRateId) setValues.taxRateId = rule.taxRateId;

                if (Object.keys(setValues).length > 0) {
                  await db
                    .update(bankTransaction)
                    .set(setValues)
                    .where(eq(bankTransaction.id, tx.id));
                  updated++;
                }
              }

              break; // First matching rule wins (highest priority first)
            }
          }
        }

        return {
          matched,
          updated: params.dryRun ? 0 : updated,
          dryRun: params.dryRun,
          matches: params.dryRun ? matches : undefined,
        };
      })
  );
}
