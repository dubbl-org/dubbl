import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { SEARCH_TYPES, searchEverything } from "@/lib/search/everything";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerSearchTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "search_everything",
    "Search the whole workspace at once: invoices, bills, quotes, expense claims, payments, contacts, bank transactions, journal entries, inventory items and files. Text matches numbers, references, names, descriptions and payees. Pass an amount in integer cents to find records of that size (sign ignored), for example to match a receipt to its bank line or check whether a bill was already entered. Returns up to `limitPerType` results per type, each with type, id, title, subtitle, amount (cents), currency, date (YYYY-MM-DD), status and an in-app link.",
    {
      query: z
        .string()
        .max(200)
        .optional()
        .describe("Words to look for, e.g. a supplier name, document number or description. At least 2 characters; optional when `amount` is given"),
      amount: z
        .number()
        .int()
        .optional()
        .describe("Only return records whose amount is this many integer cents, e.g. 4999 for 49.99. Sign is ignored"),
      amountTolerance: z
        .number()
        .int()
        .min(0)
        .max(100000)
        .optional()
        .default(0)
        .describe("How many cents the amount may differ by, e.g. 100 to allow 1.00 either way for currency rounding"),
      types: z
        .array(z.enum(SEARCH_TYPES))
        .optional()
        .describe("Limit the search to these record types. Leave out to search everything"),
      limitPerType: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Maximum results per record type (1-20)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        if ((params.query?.trim().length ?? 0) < 2 && params.amount == null) {
          throw new Error("Give a query of at least 2 characters or an amount");
        }
        const results = await searchEverything({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          query: params.query,
          amount: params.amount,
          amountTolerance: params.amountTolerance,
          types: params.types,
          limitPerType: params.limitPerType,
        });
        return { results, count: results.length };
      })
  );
}
