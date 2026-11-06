import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { inventoryItem, inventoryMovement, auditLog } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { createInventoryAdjustmentJournalEntry } from "@/lib/api/journal-automation";
import { type ValuedItem } from "@/lib/api/inventory-valuation";
import {
  assertInventoryPeriodOpen,
  fail,
  postInventoryValueChange,
  todayIso,
} from "@/lib/api/inventory-ops";
import { createInventoryItem, updateInventoryItem } from "@/lib/api/inventory-items";
import { cancelTransfer, completeTransfer, createTransfer } from "@/lib/api/inventory-transfers";
import { applyStockTake } from "@/lib/api/stock-takes";
import { buildAssemblyOrder } from "@/lib/api/assembly";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Inventory MCP tools.
 *
 * QUANTITIES: whole units (matching inventoryItem.quantityOnHand), unless a
 * field explicitly says otherwise. MONETARY AMOUNTS: integer cents (e.g. $12.50
 * = 1250). All tools are org-scoped via the AuthContext and use direct Drizzle
 * access (no HTTP self-calls). Stock-moving tools also post the matching
 * double-entry journal so the GL and the perpetual inventory stay in lock-step.
 */
export function registerInventoryTools(server: McpServer, ctx: AuthContext) {
  // ─── List items ───────────────────────────────────────────────────
  server.tool(
    "list_inventory_items",
    "List inventory items for the organization. Returns each item's quantityOnHand (whole units), averageCost and totalValue (integer cents — totalValue is the on-hand book value), costMethod (average/fifo/standard), purchase/sale price (cents) and reorder point. Use to find an inventoryItemId before adjusting, transferring, or building stock.",
    {
      search: z
        .string()
        .optional()
        .describe("Case-insensitive filter matched against item code, name, or SKU"),
      activeOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe("When true (default) only return active items; false returns active + inactive"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const conditions = [
          eq(inventoryItem.organizationId, ctx.organizationId),
          notDeleted(inventoryItem.deletedAt),
        ];
        if (params.activeOnly) conditions.push(eq(inventoryItem.isActive, true));
        if (params.search) {
          const like = `%${params.search}%`;
          conditions.push(
            sql`(${inventoryItem.code} ILIKE ${like} OR ${inventoryItem.name} ILIKE ${like} OR ${inventoryItem.sku} ILIKE ${like})`
          );
        }

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.inventoryItem.findMany({
          where: and(...conditions),
          orderBy: desc(inventoryItem.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(inventoryItem)
          .where(and(...conditions));

        return {
          items: rows.map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            sku: i.sku,
            category: i.category,
            costMethod: i.costMethod,
            quantityOnHand: i.quantityOnHand, // whole units
            averageCost: i.averageCost, // cents per unit
            totalValue: i.totalValue, // cents, on-hand book value
            purchasePrice: i.purchasePrice, // cents
            salePrice: i.salePrice, // cents
            reorderPoint: i.reorderPoint,
            unitOfMeasure: i.unitOfMeasure,
            trackingMethod: i.trackingMethod,
            isActive: i.isActive,
          })),
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ─── Adjust stock ─────────────────────────────────────────────────
  server.tool(
    "adjust_inventory_stock",
    "Adjust an inventory item and post the matching journal entry (same posting as the app). Three kinds: " +
      "'quantity': change on-hand by 'quantityDelta' whole units (positive = found stock, negative = shrinkage/loss), valued at the item's current cost, posting DR Inventory Shrinkage 5010 / CR Inventory on a loss (reversed for found stock). " +
      "'write_down': lower the item's book value by 'amount' integer cents without changing quantity (obsolescence, damage), posting DR Inventory Write-Down 5020 / CR Inventory. " +
      "'revaluation': change the book value by 'amount' integer cents (positive = up, negative = down) without changing quantity. Inventory is carried at the lower of cost and net realisable value, so both directions post against Inventory Write-Down 5020 (an increase reverses earlier write-downs). " +
      "Respects lock dates. Returns the updated item, the movement and the posted journalEntryId.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item to adjust"),
      kind: z
        .enum(["quantity", "write_down", "revaluation"])
        .describe("Kind of adjustment: 'quantity' (count change), 'write_down' (value down only), 'revaluation' (value up or down)"),
      quantityDelta: z
        .number()
        .int()
        .optional()
        .describe("Required for kind='quantity': whole-unit change (positive = found, negative = loss). Ignored for other kinds."),
      amount: z
        .number()
        .int()
        .optional()
        .describe("Integer cents. Required for kind='write_down' (size of the write-down) and kind='revaluation' (positive = up, negative = down). Ignored for kind='quantity'."),
      reason: z.string().min(1).describe("Reason for the adjustment (recorded on the movement and entry)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Posting date (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const item = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, params.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        if (!item) fail("Inventory item not found", 404);

        const date = params.date || todayIso();
        await assertInventoryPeriodOpen(ctx.organizationId, date, ctx);

        if (params.kind === "quantity") {
          if (params.quantityDelta == null || params.quantityDelta === 0) {
            fail("quantityDelta (non-zero) is required for kind='quantity'");
          }
          const newQuantity = item.quantityOnHand + params.quantityDelta;
          if (newQuantity < 0) fail("Adjustment would result in negative quantity");

          const result = await db.transaction(async (tx) => {
            // Re-read inside the transaction so the cost used is current.
            const fresh = await tx.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, item.id) });
            return createInventoryAdjustmentJournalEntry(
              { organizationId: ctx.organizationId, userId: ctx.userId },
              {
                item: (fresh ?? item) as ValuedItem & { inventoryAccountId?: string | null },
                qtyDelta: params.quantityDelta!,
                reason: params.reason,
                date,
              },
              tx
            );
          });

          const updated = await db.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, item.id) });
          const movement = result
            ? await db.query.inventoryMovement.findFirst({ where: eq(inventoryMovement.id, result.movementId) })
            : null;

          await db.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "adjust_inventory_stock",
            entityType: "inventory_item",
            entityId: item.id,
            changes: { kind: "quantity", quantityDelta: params.quantityDelta, journalEntryId: result?.entryId ?? null },
          });

          return {
            inventoryItem: updated,
            movement,
            journalEntryId: result?.entryId ?? null,
            kind: "quantity",
            previousQuantity: item.quantityOnHand,
            newQuantity,
          };
        }

        if (params.amount == null || params.amount === 0) {
          fail("amount (non-zero, in cents) is required for this kind");
        }
        const valueDelta = params.kind === "write_down" ? -Math.abs(params.amount) : params.amount;
        const result = await postInventoryValueChange(ctx, {
          itemId: item.id,
          valueDelta,
          kind: params.kind,
          reason: params.reason,
          date,
        });

        const updated = await db.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, item.id) });
        const movement = await db.query.inventoryMovement.findFirst({ where: eq(inventoryMovement.id, result.movementId) });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "adjust_inventory_stock",
          entityType: "inventory_item",
          entityId: item.id,
          changes: { kind: params.kind, valueDelta, journalEntryId: result.entryId },
        });

        return {
          inventoryItem: updated,
          movement,
          journalEntryId: result.entryId,
          kind: params.kind,
          valueDelta,
          newTotalValue: result.newValue,
        };
      })
  );

  // ─── Transfer between locations (one step) ────────────────────────
  server.tool(
    "transfer_inventory_stock",
    "Move whole units of one inventory item from one location (warehouse) to another in a single step: creates a transfer and completes it at once (the stock leaves the source and arrives at the destination). Checks the source location has enough stock. A transfer only moves units between locations, so the company-wide quantity and book value don't change and no journal entry is posted. For a multi-item or staged transfer use create_inventory_transfer, send_inventory_transfer and complete_inventory_transfer. Returns the completed transfer with its lines.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item to move"),
      fromWarehouseId: z.string().uuid().describe("UUID of the source location"),
      toWarehouseId: z.string().uuid().describe("UUID of the destination location (must differ from the source)"),
      quantity: z.number().int().min(1).describe("Whole units to move (more than 0)"),
      notes: z.string().optional().describe("Optional note recorded on the transfer"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const draft = await createTransfer(ctx, {
          fromWarehouseId: params.fromWarehouseId,
          toWarehouseId: params.toWarehouseId,
          notes: params.notes ?? null,
          lines: [{ inventoryItemId: params.inventoryItemId, quantity: params.quantity }],
        });
        if (!draft) fail("Couldn't create the transfer", 500);
        try {
          const transfer = await completeTransfer(ctx, draft.id);
          await db.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "transfer_inventory_stock",
            entityType: "inventory_transfer",
            entityId: draft.id,
            changes: { ...params },
          });
          return { transfer };
        } catch (err) {
          // Don't leave an orphan draft behind when the stock check fails.
          await cancelTransfer(ctx, draft.id).catch(() => undefined);
          throw err;
        }
      })
  );

  // ─── Apply stock take ─────────────────────────────────────────────
  server.tool(
    "apply_stock_take",
    "Apply the counts of an in-progress stocktake. Every counted line is compared with live stock: that location's stock for a location stocktake, company-wide on hand otherwise. Each difference is corrected through the costing engine and posted (shortage: DR Inventory Shrinkage 5010 / CR Inventory at cost; overage: DR Inventory / CR 5010 at average cost), one entry per item. Uncounted lines are left alone. Respects lock dates. Marks the stocktake completed. Returns the completed stocktake, adjustedCount and the posted journalEntryIds.",
    {
      stockTakeId: z.string().uuid().describe("UUID of the in-progress stocktake to apply"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Posting date for the adjustment entries (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const result = await applyStockTake(ctx, params.stockTakeId, params.date || todayIso());
        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "apply_stock_take",
          entityType: "stock_take",
          entityId: params.stockTakeId,
          changes: { adjustedCount: result.adjustedCount, journalEntryIds: result.journalEntryIds },
        });
        return result;
      })
  );

  // ─── Build assembly ───────────────────────────────────────────────
  server.tool(
    "build_assembly",
    "Complete (build) a planned or in-progress assembly order: uses up every part on the bill of materials (quantity per unit x build quantity plus wastage, rounded up to whole units) at its current average or FIFO cost, adds labour + overhead (cents per unit x build quantity), and adds the finished items at the rolled-up unit cost. Checks stock for every part before anything moves. Posts one balanced entry: DR the finished item's inventory account (else Inventory 1300) / CR each part's inventory account / CR 2305 Manufacturing/WIP Clearing for labour, overhead and rounding. Respects lock dates. Returns the completed order, journalEntryId, componentCost, conversionCost, totalCost and unitCost (cents).",
    {
      assemblyOrderId: z.string().uuid().describe("UUID of the planned or in-progress assembly order to build"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Posting date for the build entry (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const result = await buildAssemblyOrder(ctx, params.assemblyOrderId, params.date || todayIso());
        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "build_assembly",
          entityType: "assembly_order",
          entityId: params.assemblyOrderId,
          changes: { journalEntryId: result.journalEntryId, totalCost: result.totalCost, unitCost: result.unitCost },
        });
        return result;
      })
  );

  // ─── List movements ───────────────────────────────────────────────
  server.tool(
    "list_inventory_movements",
    "List inventory movements (the per-transaction stock ledger) for the organization, newest first. Each movement records the type (adjustment/transfer_in/transfer_out/stock_take/purchase/sale/initial), the signed quantity change (whole units; negative = stock out), the unitCost and signed value (integer cents), the warehouse, any source reference, and the linked journalEntryId. Optionally filter by item, warehouse, or movement type. Use to audit how an item's stock and value changed.",
    {
      inventoryItemId: z.string().uuid().optional().describe("Filter to a single inventory item"),
      warehouseId: z.string().uuid().optional().describe("Filter to a single warehouse"),
      type: z
        .enum(["adjustment", "transfer_in", "transfer_out", "stock_take", "purchase", "sale", "initial"])
        .optional()
        .describe("Filter by movement type"),
      limit: z.number().int().min(1).max(200).optional().default(50).describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const conditions = [eq(inventoryMovement.organizationId, ctx.organizationId)];
        if (params.inventoryItemId) {
          conditions.push(eq(inventoryMovement.inventoryItemId, params.inventoryItemId));
        }
        if (params.warehouseId) {
          conditions.push(eq(inventoryMovement.warehouseId, params.warehouseId));
        }
        if (params.type) conditions.push(eq(inventoryMovement.type, params.type));

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.inventoryMovement.findMany({
          where: and(...conditions),
          orderBy: desc(inventoryMovement.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(inventoryMovement)
          .where(and(...conditions));

        return {
          movements: rows.map((m) => ({
            id: m.id,
            inventoryItemId: m.inventoryItemId,
            warehouseId: m.warehouseId,
            type: m.type,
            quantity: m.quantity, // signed whole units
            previousQuantity: m.previousQuantity,
            newQuantity: m.newQuantity,
            unitCost: m.unitCost, // cents per unit
            value: m.value, // signed cents
            journalEntryId: m.journalEntryId,
            reason: m.reason,
            referenceType: m.referenceType,
            referenceId: m.referenceId,
            createdAt: m.createdAt,
          })),
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ─── Create item ──────────────────────────────────────────────────
  server.tool(
    "create_inventory_item",
    "Create an inventory item (product). code and name are required; code must be unique within the org. Prices are integer cents (e.g. $12.50 = 1250). Opening stock (quantityOnHand > 0) needs a purchasePrice: it's received at that cost into warehouseId (else the default location), and posted DR Inventory / CR Opening Balance Equity 3000 (respects lock dates). A category name is matched to an existing category or creates one. Returns the created item.",
    {
      code: z.string().min(1).describe("Item code (unique within the org)"),
      name: z.string().min(1).describe("Item name"),
      description: z.string().nullable().optional().describe("Optional longer description"),
      categoryId: z.string().uuid().nullable().optional().describe("Category UUID (see list_inventory_categories); wins over category"),
      category: z.string().nullable().optional().describe("Category name; matched to an existing category or created"),
      sku: z.string().nullable().optional().describe("Optional stock-keeping unit"),
      purchasePrice: z.number().int().min(0).optional().default(0).describe("Purchase price in integer cents; also the unit cost of any opening stock"),
      salePrice: z.number().int().min(0).optional().default(0).describe("Sale price in integer cents"),
      costMethod: z.enum(["average", "fifo"]).optional().describe("Costing method: 'average' (moving average, default) or 'fifo' (first in, first out)"),
      trackingMethod: z.enum(["none", "serial", "lot", "batch"]).optional().describe("Tracking label (default none). Serial and lot numbers aren't captured yet, so this is informational"),
      unitOfMeasure: z.string().nullable().optional().describe("Unit name, e.g. 'each', 'box', 'kg'"),
      costAccountId: z.string().uuid().nullable().optional().describe("Cost of sales (expense) account UUID; defaults to 5000"),
      revenueAccountId: z.string().uuid().nullable().optional().describe("Sales (revenue) account UUID, filled in on invoice lines"),
      inventoryAccountId: z.string().uuid().nullable().optional().describe("Inventory (asset) account UUID; defaults to 1300"),
      quantityOnHand: z.number().int().min(0).optional().default(0).describe("Opening quantity in whole units (needs purchasePrice > 0)"),
      warehouseId: z.string().uuid().nullable().optional().describe("Location for the opening stock; defaults to the default location"),
      reorderPoint: z.number().int().min(0).optional().default(0).describe("Reorder point in whole units"),
      isActive: z.boolean().optional().default(true).describe("Whether the item is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const created = await createInventoryItem(ctx, params);
        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "create",
          entityType: "inventory_item",
          entityId: created.id,
        });
        return { inventoryItem: created };
      })
  );

  // ─── Get item ─────────────────────────────────────────────────────
  server.tool(
    "get_inventory_item",
    "Get a single inventory item by ID. Returns the full item: quantityOnHand (whole units), averageCost / standardCost / totalValue / purchasePrice / salePrice (integer cents — totalValue is the on-hand book value), costMethod, reorder point, the linked cost/revenue/inventory account ids, and active flag.",
    {
      inventoryItemId: z.string().uuid().describe("The UUID of the inventory item"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, params.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        if (!found) throw new Error("Inventory item not found");
        return { inventoryItem: found };
      })
  );

  // ─── Update item ──────────────────────────────────────────────────
  server.tool(
    "update_inventory_item",
    "Update an inventory item's details (not its stock). Only the fields you pass change. Prices are integer cents. Changing costMethod between 'average' and 'fifo' keeps the book value: switching to FIFO starts one layer at the current unit cost. Use adjust_inventory_stock to change quantity or value. Returns the updated item.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item to update"),
      code: z.string().min(1).optional().describe("Item code (unique within the org)"),
      name: z.string().min(1).optional().describe("Item name"),
      description: z.string().nullable().optional().describe("Longer description (null to clear)"),
      categoryId: z.string().uuid().nullable().optional().describe("Category UUID (null to clear)"),
      category: z.string().nullable().optional().describe("Category name; matched or created (null to clear)"),
      sku: z.string().nullable().optional().describe("Stock-keeping unit (null to clear)"),
      purchasePrice: z.number().int().min(0).optional().describe("Purchase price in integer cents"),
      salePrice: z.number().int().min(0).optional().describe("Sale price in integer cents"),
      costMethod: z.enum(["average", "fifo"]).optional().describe("Costing method: 'average' or 'fifo'"),
      trackingMethod: z.enum(["none", "serial", "lot", "batch"]).optional().describe("Tracking label (informational)"),
      unitOfMeasure: z.string().nullable().optional().describe("Unit name, e.g. 'each' (null to clear)"),
      costAccountId: z.string().uuid().nullable().optional().describe("Cost of sales (expense) account UUID (null for the default 5000)"),
      revenueAccountId: z.string().uuid().nullable().optional().describe("Sales (revenue) account UUID (null to clear)"),
      inventoryAccountId: z.string().uuid().nullable().optional().describe("Inventory (asset) account UUID (null for the default 1300)"),
      reorderPoint: z.number().int().min(0).optional().describe("Reorder point in whole units"),
      isActive: z.boolean().optional().describe("Whether the item is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const { inventoryItemId, ...fields } = params;
        const { updated } = await updateInventoryItem(ctx, inventoryItemId, fields);
        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "update",
          entityType: "inventory_item",
          entityId: inventoryItemId,
          changes: fields,
        });
        return { inventoryItem: updated };
      })
  );

  // ─── Delete item ──────────────────────────────────────────────────
  server.tool(
    "delete_inventory_item",
    "Soft-delete an inventory item (sets deletedAt; the row and its history are retained). The item stops appearing in lists and lookups. Returns { success: true }.",
    {
      inventoryItemId: z.string().uuid().describe("The UUID of the inventory item to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const existing = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, params.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        if (!existing) throw new Error("Inventory item not found");

        await db
          .update(inventoryItem)
          .set(softDelete())
          .where(eq(inventoryItem.id, params.inventoryItemId));

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "delete",
          entityType: "inventory_item",
          entityId: params.inventoryItemId,
        });

        return { success: true };
      })
  );
}
