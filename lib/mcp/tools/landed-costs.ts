import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { fail } from "@/lib/api/inventory-ops";
import {
  allocateLandedCost,
  createLandedCost,
  deleteLandedCost,
  getLandedCost,
  LANDED_COST_METHODS,
  listLandedCosts,
  updateLandedCost,
} from "@/lib/api/landed-costs";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Landed-cost MCP tools: freight, duty, insurance and similar costs spread
 * across a purchase order's lines and added to the cost of the stock behind
 * them. Same service as the REST routes (lib/api/landed-costs.ts).
 *
 * MONEY: integer cents everywhere (e.g. $12.50 = 1250), in the landed cost's
 * currency. PO-line quantities are stored x100 (5 units = 500).
 */

const componentSchema = z.object({
  description: z.string().min(1).describe("What the cost is, e.g. 'Sea freight' or 'Import duty'"),
  amount: z.number().int().min(0).describe("Amount in integer cents (e.g. 12500 = $125.00)"),
  accountId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Chart account the bill for this cost was coded to; applying credits it. Omit to use 2160 Landed Costs Clearing"),
});

export function registerLandedCostTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_landed_costs",
    "List landed costs (freight, duty and similar extra costs on purchases), newest first. totalCostAmount and component amounts are integer cents; status is 'draft' (not applied) or 'allocated' (applied to stock and posted). Returns { allocations, total, page, limit } with each allocation's components, bill and purchase order.",
    {
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Number to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { items, total } = await listLandedCosts(ctx.organizationId, {
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
        });
        return { allocations: items, total, page: params.page, limit: params.limit };
      })
  );

  server.tool(
    "get_landed_cost",
    "Get one landed cost with its costs (each with its account), the per-line split once applied (lineAllocations, cents), the bill, the journal entry, and the purchase order with its lines (each line's inventoryItem, quantity x100 and amount in cents). Use the line ids for manual splits in allocate_landed_cost.",
    { landedCostId: z.string().uuid().describe("UUID of the landed cost") },
    (params) =>
      wrapTool(ctx, async () => {
        const item = await getLandedCost(ctx.organizationId, params.landedCostId);
        if (!item) fail("Landed cost not found", 404);
        return { allocation: item };
      })
  );

  server.tool(
    "create_landed_cost",
    "Create a landed cost (not applied yet). Amounts are integer cents. Link the purchase order whose lines the costs should be spread across (needed to apply), and optionally the bill that charged the costs. allocationMethod: 'by_value' (by line amount), 'by_quantity' (by line units) or 'manual' (you give per-line amounts when applying). Currency defaults to the bill's, else the PO's, else the base currency. Returns the created landed cost.",
    {
      name: z.string().min(1).describe("Name, e.g. 'Freight and duty for PO-0012'"),
      purchaseOrderId: z.string().uuid().nullable().optional().describe("Purchase order the costs belong to (required before applying)"),
      billId: z.string().uuid().nullable().optional().describe("Optional bill that charged these costs (e.g. the freight forwarder's bill)"),
      allocationMethod: z.enum(LANDED_COST_METHODS).optional().default("by_value").describe("How to split across PO lines: by_value, by_quantity or manual"),
      currencyCode: z.string().length(3).optional().describe("ISO currency of the amounts, e.g. 'USD'"),
      components: z.array(componentSchema).min(1).describe("The costs, each with a description and an amount in cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");
        const allocation = await createLandedCost(ctx, params);
        return { allocation };
      })
  );

  server.tool(
    "update_landed_cost",
    "Change a landed cost that hasn't been applied: name, linked PO or bill, split method, currency, or replace all its costs (amounts in integer cents). Returns the updated landed cost. Fails once applied.",
    {
      landedCostId: z.string().uuid().describe("UUID of the landed cost"),
      name: z.string().min(1).optional().describe("New name"),
      purchaseOrderId: z.string().uuid().nullable().optional().describe("Purchase order to link (null to unlink)"),
      billId: z.string().uuid().nullable().optional().describe("Bill to link (null to unlink)"),
      allocationMethod: z.enum(LANDED_COST_METHODS).optional().describe("by_value, by_quantity or manual"),
      currencyCode: z.string().length(3).optional().describe("ISO currency of the amounts"),
      components: z.array(componentSchema).min(1).optional().describe("Replaces all costs when given"),
    },
    ({ landedCostId, ...input }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");
        return { allocation: await updateLandedCost(ctx, landedCostId, input) };
      })
  );

  server.tool(
    "delete_landed_cost",
    "Delete a landed cost that hasn't been applied (moves it to the trash). Applied landed costs have posted entries and can't be deleted. Returns { success: true }.",
    { landedCostId: z.string().uuid().describe("UUID of the landed cost") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");
        await deleteLandedCost(ctx, params.landedCostId);
        return { success: true };
      })
  );

  server.tool(
    "allocate_landed_cost",
    "Apply a landed cost: split each cost across the linked purchase order's lines (by value, by quantity, or the manualAmounts you pass) and post one balanced entry in the base currency. For lines linked to a stock item, the share for units still on hand raises the item's book value and average cost (FIFO layers too); the share for units already sold goes to the item's cost of sales account (else 5000). Lines with no stock item get their share on the line's account. Credits each cost's account, else 2160 Landed Costs Clearing. Respects lock dates. Returns the applied landed cost, journalEntryId, addedToStock and toCostOfSales (cents, base currency).",
    {
      landedCostId: z.string().uuid().describe("UUID of the landed cost to apply (must not be applied yet)"),
      manualAmounts: z
        .array(
          z.object({
            purchaseOrderLineId: z.string().uuid().describe("PO line id (from get_landed_cost)"),
            amount: z.number().int().min(0).describe("Share for this line in integer cents"),
          })
        )
        .optional()
        .describe("Required for the 'manual' method: amount per PO line, adding up to totalCostAmount. Lines left out get 0"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Posting date YYYY-MM-DD (defaults to today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");
        return allocateLandedCost(ctx, params.landedCostId, { manualAmounts: params.manualAmounts, date: params.date });
      })
  );
}
