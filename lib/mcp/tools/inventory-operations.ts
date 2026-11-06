import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { fail } from "@/lib/api/inventory-ops";
import {
  addBomComponent,
  cancelAssemblyOrder,
  createAssemblyOrder,
  createBom,
  deleteBom,
  getBom,
  listAssemblyOrders,
  listBoms,
  removeBomComponent,
  startAssemblyOrder,
  updateBom,
  updateBomComponent,
} from "@/lib/api/assembly";
import {
  cancelStockTake,
  createStockTake,
  getStockTake,
  listStockTakes,
  recordStockTakeCount,
  startStockTake,
} from "@/lib/api/stock-takes";
import {
  cancelTransfer,
  completeTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  sendTransfer,
} from "@/lib/api/inventory-transfers";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Inventory operations MCP tools: bills of materials, assembly orders,
 * stocktakes and location transfers. Building (build_assembly), applying a
 * stocktake (apply_stock_take) and the one-step transfer_inventory_stock live
 * in ./inventory.ts. Money is integer cents; quantities are whole units
 * (BOM part quantities per finished unit may be decimals).
 */
export function registerInventoryOperationTools(server: McpServer, ctx: AuthContext) {
  // ─── Bills of materials ───────────────────────────────────────────
  server.tool(
    "list_boms",
    "List bills of materials (recipes for items you build): the finished item (assemblyItem), parts (components with quantity per unit and wastagePercent), labour and overhead per unit (laborCostCents, overheadCostCents) and costBreakdown (estimated cost to build one, integer cents, from the parts' current book cost).",
    {},
    () => wrapTool(ctx, async () => ({ boms: await listBoms(ctx.organizationId) }))
  );

  server.tool(
    "get_bom",
    "Get one bill of materials with its finished item, parts and costBreakdown (componentCost, laborCost, overheadCost, totalCost per finished unit, integer cents).",
    { bomId: z.string().uuid().describe("UUID of the bill of materials") },
    (params) =>
      wrapTool(ctx, async () => {
        const result = await getBom(ctx.organizationId, params.bomId);
        if (!result) fail("Bill of materials not found", 404);
        return result;
      })
  );

  const componentSchema = z.object({
    componentItemId: z.string().uuid().describe("UUID of the part (an inventory item, not the finished item)"),
    quantity: z.number().positive().describe("Quantity of the part per finished unit (decimals allowed)"),
    wastagePercent: z.number().min(0).max(1000).optional().describe("Extra percentage used up as waste (default 0)"),
  });

  server.tool(
    "create_bom",
    "Create a bill of materials for an item you build, optionally with its parts. Labour and overhead are integer cents per finished unit and are added to the finished item's cost on each build. Returns { bom, costBreakdown }.",
    {
      assemblyItemId: z.string().uuid().describe("UUID of the finished inventory item this recipe makes"),
      name: z.string().min(1).describe("Name, e.g. 'Standing desk, standard build'"),
      description: z.string().nullable().optional().describe("Optional description"),
      laborCostCents: z.number().int().min(0).optional().describe("Labour per finished unit in integer cents"),
      overheadCostCents: z.number().int().min(0).optional().describe("Overhead per finished unit in integer cents"),
      components: z.array(componentSchema).optional().describe("Parts to add straight away"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return createBom(ctx, params);
      })
  );

  server.tool(
    "update_bom",
    "Change a bill of materials' details: name, description, finished item, labour or overhead (integer cents per unit) or active flag. Use the component tools to change parts. Returns { bom, costBreakdown }.",
    {
      bomId: z.string().uuid().describe("UUID of the bill of materials"),
      name: z.string().min(1).optional().describe("New name"),
      description: z.string().nullable().optional().describe("Description (null to clear)"),
      assemblyItemId: z.string().uuid().optional().describe("UUID of a different finished item"),
      laborCostCents: z.number().int().min(0).optional().describe("Labour per finished unit in integer cents"),
      overheadCostCents: z.number().int().min(0).optional().describe("Overhead per finished unit in integer cents"),
      isActive: z.boolean().optional().describe("Inactive bills of materials can't get new assembly orders"),
    },
    ({ bomId, ...input }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return updateBom(ctx, bomId, input);
      })
  );

  server.tool(
    "delete_bom",
    "Delete a bill of materials (moves it to the trash). Fails while it has planned or in-progress assembly orders. Returns { success: true }.",
    { bomId: z.string().uuid().describe("UUID of the bill of materials") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await deleteBom(ctx, params.bomId);
        return { success: true };
      })
  );

  server.tool(
    "add_bom_component",
    "Add a part to a bill of materials: an inventory item, its quantity per finished unit and optional wastage percent. Each part can appear once; the finished item can't be its own part. Returns the component.",
    { bomId: z.string().uuid().describe("UUID of the bill of materials"), ...componentSchema.shape },
    ({ bomId, ...input }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { component: await addBomComponent(ctx, bomId, input) };
      })
  );

  server.tool(
    "update_bom_component",
    "Change a part's quantity per finished unit or wastage percent on a bill of materials. Returns the component.",
    {
      bomId: z.string().uuid().describe("UUID of the bill of materials"),
      componentId: z.string().uuid().describe("UUID of the component (from get_bom)"),
      quantity: z.number().positive().optional().describe("Quantity per finished unit"),
      wastagePercent: z.number().min(0).max(1000).optional().describe("Wastage percent"),
    },
    ({ bomId, componentId, ...input }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { component: await updateBomComponent(ctx, bomId, componentId, input) };
      })
  );

  server.tool(
    "remove_bom_component",
    "Remove a part from a bill of materials. Past builds are not affected. Returns { success: true }.",
    {
      bomId: z.string().uuid().describe("UUID of the bill of materials"),
      componentId: z.string().uuid().describe("UUID of the component"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await removeBomComponent(ctx, params.bomId, params.componentId);
        return { success: true };
      })
  );

  // ─── Assembly orders ──────────────────────────────────────────────
  server.tool(
    "list_assembly_orders",
    "List assembly orders, newest first, with their bill of materials and finished item. status: draft (planned), in_progress (building; nothing reserved), completed (built) or cancelled.",
    {},
    () => wrapTool(ctx, async () => ({ orders: await listAssemblyOrders(ctx.organizationId) }))
  );

  server.tool(
    "create_assembly_order",
    "Plan a build: an assembly order for a whole number of finished units from an active bill of materials. Nothing moves until build_assembly. Returns the order.",
    {
      bomId: z.string().uuid().describe("UUID of the bill of materials to build"),
      quantity: z.number().int().min(1).describe("Finished units to build"),
      notes: z.string().nullable().optional().describe("Optional notes"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { order: await createAssemblyOrder(ctx, params) };
      })
  );

  server.tool(
    "start_assembly_order",
    "Mark a planned assembly order as being built (in_progress). Nothing is reserved; parts are used up when you call build_assembly. Returns the order.",
    { assemblyOrderId: z.string().uuid().describe("UUID of the planned assembly order") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { order: await startAssemblyOrder(ctx, params.assemblyOrderId) };
      })
  );

  server.tool(
    "cancel_assembly_order",
    "Cancel a planned or in-progress assembly order. Nothing has been used up, so stock doesn't change. Built orders can't be cancelled. Returns the order.",
    { assemblyOrderId: z.string().uuid().describe("UUID of the assembly order") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { order: await cancelAssemblyOrder(ctx, params.assemblyOrderId) };
      })
  );

  // ─── Stocktakes ───────────────────────────────────────────────────
  server.tool(
    "list_stock_takes",
    "List stocktakes (physical counts), newest first, with status (draft = not started, in_progress = counting, completed, cancelled), location (null = all locations), itemCount, countedCount and discrepancyCount.",
    {},
    () => wrapTool(ctx, async () => ({ stockTakes: await listStockTakes(ctx.organizationId) }))
  );

  server.tool(
    "get_stock_take",
    "Get one stocktake with its lines: each line's item, expectedQuantity, countedQuantity (null = not counted), discrepancy, and after applying valueAdjustment (signed cents) and journalEntryId.",
    { stockTakeId: z.string().uuid().describe("UUID of the stocktake") },
    (params) =>
      wrapTool(ctx, async () => {
        const st = await getStockTake(ctx.organizationId, params.stockTakeId);
        if (!st) fail("Stocktake not found", 404);
        return { stockTake: st };
      })
  );

  server.tool(
    "create_stock_take",
    "Create a stocktake (not started) with a count line for every active item. With warehouseId it counts that location and compares with that location's stock; without it, it compares with company-wide stock. Returns the stocktake with its lines.",
    {
      name: z.string().min(1).describe("Name, e.g. 'Q4 full count'"),
      warehouseId: z.string().uuid().nullable().optional().describe("Location to count; omit for all locations"),
      notes: z.string().nullable().optional().describe("Optional notes"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { stockTake: await createStockTake(ctx, params) };
      })
  );

  server.tool(
    "start_stock_take",
    "Start counting a stocktake. Expected quantities are refreshed from today's stock. Counts can only be recorded once started. Returns the stocktake.",
    { stockTakeId: z.string().uuid().describe("UUID of the stocktake") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { stockTake: await startStockTake(ctx, params.stockTakeId) };
      })
  );

  server.tool(
    "record_stock_take_count",
    "Record the counted quantity (whole units) for one item on an in-progress stocktake. Identify the line by lineId or by inventoryItemId. Nothing is posted until apply_stock_take. Returns the line with its discrepancy (counted minus expected).",
    {
      stockTakeId: z.string().uuid().describe("UUID of the in-progress stocktake"),
      lineId: z.string().uuid().optional().describe("UUID of the stocktake line"),
      inventoryItemId: z.string().uuid().optional().describe("UUID of the item (instead of lineId)"),
      countedQuantity: z.number().int().min(0).describe("Units counted"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const line = await recordStockTakeCount(
          ctx,
          params.stockTakeId,
          { lineId: params.lineId, inventoryItemId: params.inventoryItemId },
          params.countedQuantity
        );
        return { line };
      })
  );

  server.tool(
    "cancel_stock_take",
    "Cancel a stocktake that hasn't been applied. Nothing is posted and stock stays as it is. Returns the stocktake.",
    { stockTakeId: z.string().uuid().describe("UUID of the stocktake") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { stockTake: await cancelStockTake(ctx, params.stockTakeId) };
      })
  );

  // ─── Transfers ────────────────────────────────────────────────────
  server.tool(
    "list_inventory_transfers",
    "List stock transfers between locations, newest first. status: draft (nothing moved), in_transit (on the way: left the source), completed (arrived) or cancelled. Includes from/to locations and lines (item, quantity, receivedQuantity).",
    {},
    () => wrapTool(ctx, async () => ({ transfers: await listTransfers(ctx.organizationId) }))
  );

  server.tool(
    "get_inventory_transfer",
    "Get one stock transfer with its locations and lines.",
    { transferId: z.string().uuid().describe("UUID of the transfer") },
    (params) =>
      wrapTool(ctx, async () => {
        const transfer = await getTransfer(ctx.organizationId, params.transferId);
        if (!transfer) fail("Transfer not found", 404);
        return { transfer };
      })
  );

  server.tool(
    "create_inventory_transfer",
    "Create a draft transfer of one or more items between two different locations. Nothing moves yet: call send_inventory_transfer (stock leaves the source) and complete_inventory_transfer (stock arrives). No journal entry is ever posted, since company-wide stock and value don't change. Returns the transfer.",
    {
      fromWarehouseId: z.string().uuid().describe("UUID of the source location"),
      toWarehouseId: z.string().uuid().describe("UUID of the destination location (active, and different from the source)"),
      notes: z.string().nullable().optional().describe("Optional note"),
      lines: z
        .array(
          z.object({
            inventoryItemId: z.string().uuid().describe("UUID of the item"),
            quantity: z.number().int().min(1).describe("Whole units to move"),
          })
        )
        .min(1)
        .describe("Items and quantities"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { transfer: await createTransfer(ctx, params) };
      })
  );

  server.tool(
    "send_inventory_transfer",
    "Mark a draft transfer as on the way: checks the source location has enough of every item, then takes the stock out of the source. Returns the transfer.",
    { transferId: z.string().uuid().describe("UUID of the draft transfer") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { transfer: await sendTransfer(ctx, params.transferId) };
      })
  );

  server.tool(
    "complete_inventory_transfer",
    "Mark a transfer as arrived: adds the stock at the destination (sending it from the source first if it's still a draft, with the same stock check). Returns the transfer.",
    { transferId: z.string().uuid().describe("UUID of the draft or on-the-way transfer") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { transfer: await completeTransfer(ctx, params.transferId) };
      })
  );

  server.tool(
    "cancel_inventory_transfer",
    "Cancel a draft or on-the-way transfer. Stock already on the way goes back to the source location. Arrived transfers can't be cancelled (create a transfer back instead). Returns the transfer.",
    { transferId: z.string().uuid().describe("UUID of the transfer") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { transfer: await cancelTransfer(ctx, params.transferId) };
      })
  );
}
