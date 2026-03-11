import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { chartAccount, journalLine, journalEntry } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerAccountTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_accounts",
    "List all chart of accounts for the organization. Returns account code, name, type (asset/liability/equity/revenue/expense), and active status.",
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
        const conditions = [
          eq(chartAccount.organizationId, ctx.organizationId),
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
    "Create a new chart of accounts entry. Account code must be unique within the organization. Type determines the account's normal balance (asset/expense = debit, liability/equity/revenue = credit).",
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
          })
          .returning();

        return { account };
      })
  );

  server.tool(
    "update_account",
    "Update an existing account. Only code, name, sub-type, active status, and description can be changed. Type cannot be changed after creation.",
    {
      accountId: z.string().describe("The UUID of the account to update"),
      code: z.string().optional().describe("New account code"),
      name: z.string().optional().describe("New account name"),
      subType: z.string().optional().describe("New sub-type"),
      isActive: z.boolean().optional().describe("Set active/inactive"),
      description: z.string().optional().describe("New description"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");

        const { accountId, ...updates } = params;
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
    "Delete an account. Fails if the account has any journal line entries. This is a permanent deletion, not a soft delete.",
    {
      accountId: z.string().describe("The UUID of the account to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");

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
}
