import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  inventoryItem,
  inventoryMovement,
  warehouse,
  warehouseStock,
  inventoryTransfer,
  inventoryTransferLine,
  stockTake,
  stockTakeLine,
  assemblyOrder,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import {
  getNextEntryNumber,
  ensureControlAccount,
  ensureAccountByCode,
  resolveBaseRate,
  createInventoryAdjustmentJournalEntry,
} from "@/lib/api/journal-automation";
import {
  recordInventoryIssue,
  recordInventoryReceipt,
  type ValuedItem,
} from "@/lib/api/inventory-valuation";
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
    "Adjust an inventory item and post the matching journal entry. Three kinds: " +
      "'quantity' — change on-hand by 'quantityDelta' whole units (positive = found stock, negative = shrinkage/loss); valued at the item's current average cost, posting DR Inventory Shrinkage 5010 / CR Inventory on a loss (reversed for found stock). " +
      "'write_down' — reduce the item's book value by 'amount' integer cents WITHOUT changing quantity (e.g. obsolescence/NRV), posting DR Inventory Write-Down 5020 / CR Inventory. " +
      "'revaluation' — change the item's book value by 'amount' integer cents (positive = revalue up, negative = down) WITHOUT changing quantity, posting DR Inventory / CR Revaluation Surplus 3400 on an uplift, or DR Impairment Loss 5510 / CR Inventory on a downward revaluation. " +
      "Adjusts averageCost to keep averageCost*quantity consistent for write_down/revaluation. Returns the updated item, the movement, and the posted journalEntryId.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item to adjust"),
      kind: z
        .enum(["quantity", "write_down", "revaluation"])
        .describe("Kind of adjustment: 'quantity' (qty change), 'write_down' (value down only), 'revaluation' (value up or down)"),
      quantityDelta: z
        .number()
        .int()
        .optional()
        .describe("Required for kind='quantity': whole-unit change (positive = found, negative = loss). Ignored for other kinds."),
      amount: z
        .number()
        .int()
        .optional()
        .describe("Integer cents. Required for kind='write_down' (positive magnitude of the write-down) and kind='revaluation' (positive = up, negative = down). Ignored for kind='quantity'."),
      reason: z.string().min(1).describe("Reason / note for the adjustment (recorded on the movement)"),
      date: z
        .string()
        .optional()
        .describe("Posting date (YYYY-MM-DD); defaults to today"),
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
        if (!item) throw new Error("Inventory item not found");

        const date = params.date || new Date().toISOString().slice(0, 10);

        // ── kind = quantity: reuse the shared engine helper (handles movement,
        //    valuation change, and the shrinkage/found GL posting). ────────────
        if (params.kind === "quantity") {
          if (params.quantityDelta == null || params.quantityDelta === 0) {
            throw new Error("quantityDelta (non-zero) is required for kind='quantity'");
          }
          const newQuantity = item.quantityOnHand + params.quantityDelta;
          if (newQuantity < 0) {
            throw new Error("Adjustment would result in negative quantity");
          }

          const result = await db.transaction(async (tx) =>
            createInventoryAdjustmentJournalEntry(
              { organizationId: ctx.organizationId, userId: ctx.userId },
              {
                item: item as ValuedItem & { inventoryAccountId?: string | null },
                qtyDelta: params.quantityDelta!,
                reason: params.reason,
                date,
              },
              tx
            )
          );

          const updated = await db.query.inventoryItem.findFirst({
            where: eq(inventoryItem.id, item.id),
          });
          const movement = result
            ? await db.query.inventoryMovement.findFirst({
                where: eq(inventoryMovement.id, result.movementId),
              })
            : null;

          await db.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "adjust_inventory_stock",
            entityType: "inventory_item",
            entityId: item.id,
            changes: {
              kind: "quantity",
              quantityDelta: params.quantityDelta,
              journalEntryId: result?.entryId ?? null,
            },
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

        // ── kind = write_down / revaluation: value-only adjustment (no qty
        //    change). Build the movement + balanced GL inside one transaction. ──
        if (params.amount == null || params.amount === 0) {
          throw new Error("amount (non-zero, in cents) is required for this kind");
        }

        // Signed value delta on the item's book value (negative = reduce value).
        let valueDelta: number;
        if (params.kind === "write_down") {
          // A write-down always reduces value; accept a positive magnitude.
          valueDelta = -Math.abs(params.amount);
        } else {
          // Revaluation can go either way; sign of amount drives direction.
          valueDelta = params.amount;
        }

        const newTotalValue = item.totalValue + valueDelta;
        if (newTotalValue < 0) {
          throw new Error("Adjustment would result in negative inventory value");
        }

        const result = await db.transaction(async (tx) => {
          const { base } = await resolveBaseRate(ctx.organizationId, undefined, date);

          const invAcct =
            (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
            (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
          if (!invAcct) throw new Error("Inventory control account unavailable");

          // Resolve the offsetting account by direction/kind:
          //   write_down (always down): Inventory Write-Down 5020 (expense)
          //   revaluation down:         Impairment Loss 5510 (expense)
          //   revaluation up:           Revaluation Surplus 3400 (equity)
          const counterAcct =
            params.kind === "write_down"
              ? await ensureControlAccount(ctx.organizationId, "inventoryWriteDown", base, tx)
              : valueDelta < 0
                ? await ensureAccountByCode(
                    ctx.organizationId,
                    { code: "5510", name: "Impairment Loss", type: "expense", subType: "operating" },
                    base,
                    tx
                  )
                : await ensureAccountByCode(
                    ctx.organizationId,
                    { code: "3400", name: "Revaluation Surplus", type: "equity", subType: "equity" },
                    base,
                    tx
                  );
          if (!counterAcct) throw new Error("Offsetting account unavailable");

          const abs = Math.abs(valueDelta);

          // New moving-average unit cost so averageCost*qty stays consistent with
          // the revalued total (0 when there is no stock on hand).
          const newAverageCost =
            item.quantityOnHand > 0
              ? Math.round(newTotalValue / item.quantityOnHand)
              : 0;

          // Movement: quantity 0 (value-only), value = signed GL delta.
          const [movement] = await tx
            .insert(inventoryMovement)
            .values({
              organizationId: ctx.organizationId,
              inventoryItemId: item.id,
              type: "adjustment",
              quantity: 0,
              previousQuantity: item.quantityOnHand,
              newQuantity: item.quantityOnHand,
              unitCost: 0,
              value: valueDelta,
              reason: params.reason,
              referenceType: params.kind,
              referenceId: null,
              createdBy: ctx.userId,
            })
            .returning();

          await tx
            .update(inventoryItem)
            .set({
              totalValue: newTotalValue,
              averageCost: newAverageCost,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItem.id, item.id));

          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const description =
            params.kind === "write_down"
              ? `Inventory write-down — ${params.reason}`
              : `Inventory revaluation — ${params.reason}`;
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date,
              description,
              reference: params.kind === "write_down" ? "INV-WD" : "INV-REVAL",
              status: "posted",
              sourceType:
                params.kind === "write_down"
                  ? "inventory_write_down"
                  : "inventory_revaluation",
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          // valueDelta < 0 (down): DR counter (expense) / CR Inventory.
          // valueDelta > 0 (up, revaluation only): DR Inventory / CR surplus.
          await tx.insert(journalLine).values(
            valueDelta < 0
              ? [
                  { journalEntryId: entry.id, accountId: counterAcct.id, description, debitAmount: abs, creditAmount: 0, currencyCode: base },
                  { journalEntryId: entry.id, accountId: invAcct.id, description, debitAmount: 0, creditAmount: abs, currencyCode: base },
                ]
              : [
                  { journalEntryId: entry.id, accountId: invAcct.id, description, debitAmount: abs, creditAmount: 0, currencyCode: base },
                  { journalEntryId: entry.id, accountId: counterAcct.id, description, debitAmount: 0, creditAmount: abs, currencyCode: base },
                ]
          );

          await tx
            .update(inventoryMovement)
            .set({ journalEntryId: entry.id })
            .where(eq(inventoryMovement.id, movement.id));

          return { movementId: movement.id, entryId: entry.id, newTotalValue, newAverageCost };
        });

        const updated = await db.query.inventoryItem.findFirst({
          where: eq(inventoryItem.id, item.id),
        });
        const movement = await db.query.inventoryMovement.findFirst({
          where: eq(inventoryMovement.id, result.movementId),
        });

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
          newTotalValue: result.newTotalValue,
        };
      })
  );

  // ─── Transfer between warehouses ──────────────────────────────────
  server.tool(
    "transfer_inventory_stock",
    "Move whole units of an inventory item from one warehouse to another within the org. Decrements the source warehouse stock and increments the destination, writing a transfer_out and a transfer_in movement. This is a physical relocation only: the item's global quantityOnHand and book value are unchanged, so NO journal entry is posted. Returns the created transfer with its lines.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item to move"),
      fromWarehouseId: z.string().uuid().describe("UUID of the source warehouse"),
      toWarehouseId: z.string().uuid().describe("UUID of the destination warehouse"),
      quantity: z.number().int().min(1).describe("Whole units to transfer (must be > 0)"),
      notes: z.string().optional().describe("Optional note recorded on the transfer"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        if (params.fromWarehouseId === params.toWarehouseId) {
          throw new Error("Source and destination warehouses must differ");
        }

        const item = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, params.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        if (!item) throw new Error("Inventory item not found");

        const warehouses = await db.query.warehouse.findMany({
          where: and(
            eq(warehouse.organizationId, ctx.organizationId),
            inArray(warehouse.id, [params.fromWarehouseId, params.toWarehouseId])
          ),
        });
        if (!warehouses.some((w) => w.id === params.fromWarehouseId)) {
          throw new Error("Source warehouse not found");
        }
        if (!warehouses.some((w) => w.id === params.toWarehouseId)) {
          throw new Error("Destination warehouse not found");
        }

        // Guard against transferring more than the source warehouse holds.
        const fromStock = await db.query.warehouseStock.findFirst({
          where: and(
            eq(warehouseStock.organizationId, ctx.organizationId),
            eq(warehouseStock.inventoryItemId, item.id),
            eq(warehouseStock.warehouseId, params.fromWarehouseId)
          ),
        });
        if ((fromStock?.quantity ?? 0) < params.quantity) {
          throw new Error(
            `Insufficient stock in source warehouse: need ${params.quantity}, have ${fromStock?.quantity ?? 0}`
          );
        }

        const result = await db.transaction(async (tx) => {
          const [transfer] = await tx
            .insert(inventoryTransfer)
            .values({
              organizationId: ctx.organizationId,
              fromWarehouseId: params.fromWarehouseId,
              toWarehouseId: params.toWarehouseId,
              status: "completed",
              notes: params.notes || null,
              transferredBy: ctx.userId,
              completedAt: new Date(),
            })
            .returning();

          await tx.insert(inventoryTransferLine).values({
            transferId: transfer.id,
            inventoryItemId: item.id,
            quantity: params.quantity,
            receivedQuantity: params.quantity,
          });

          // Source warehouse stock down.
          await tx
            .insert(warehouseStock)
            .values({
              organizationId: ctx.organizationId,
              inventoryItemId: item.id,
              warehouseId: params.fromWarehouseId,
              quantity: -params.quantity,
            })
            .onConflictDoUpdate({
              target: [warehouseStock.organizationId, warehouseStock.inventoryItemId, warehouseStock.warehouseId],
              set: { quantity: sql`${warehouseStock.quantity} - ${params.quantity}`, updatedAt: new Date() },
            });

          // Destination warehouse stock up.
          await tx
            .insert(warehouseStock)
            .values({
              organizationId: ctx.organizationId,
              inventoryItemId: item.id,
              warehouseId: params.toWarehouseId,
              quantity: params.quantity,
            })
            .onConflictDoUpdate({
              target: [warehouseStock.organizationId, warehouseStock.inventoryItemId, warehouseStock.warehouseId],
              set: { quantity: sql`${warehouseStock.quantity} + ${params.quantity}`, updatedAt: new Date() },
            });

          // Paired movements; global quantityOnHand is unchanged for transfers.
          await tx.insert(inventoryMovement).values([
            {
              organizationId: ctx.organizationId,
              inventoryItemId: item.id,
              warehouseId: params.fromWarehouseId,
              type: "transfer_out",
              quantity: -params.quantity,
              previousQuantity: item.quantityOnHand,
              newQuantity: item.quantityOnHand,
              reason: "Transfer out",
              referenceType: "transfer",
              referenceId: transfer.id,
              createdBy: ctx.userId,
            },
            {
              organizationId: ctx.organizationId,
              inventoryItemId: item.id,
              warehouseId: params.toWarehouseId,
              type: "transfer_in",
              quantity: params.quantity,
              previousQuantity: item.quantityOnHand,
              newQuantity: item.quantityOnHand,
              reason: "Transfer in",
              referenceType: "transfer",
              referenceId: transfer.id,
              createdBy: ctx.userId,
            },
          ]);

          return transfer;
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "transfer_inventory_stock",
          entityType: "inventory_transfer",
          entityId: result.id,
          changes: {
            inventoryItemId: item.id,
            quantity: params.quantity,
            fromWarehouseId: params.fromWarehouseId,
            toWarehouseId: params.toWarehouseId,
          },
        });

        const full = await db.query.inventoryTransfer.findFirst({
          where: eq(inventoryTransfer.id, result.id),
          with: { lines: true },
        });

        return { transfer: full };
      })
  );

  // ─── Apply stock take ─────────────────────────────────────────────
  server.tool(
    "apply_stock_take",
    "Apply the counted quantities of an in-progress stock take: for each line whose countedQuantity differs from the system quantity, true up the item to the counted quantity and post the inventory shrinkage/found journal entry for the cost of the discrepancy (DR Inventory Shrinkage 5010 / CR Inventory on a loss, reversed for found stock), valued at the item's average cost. Updates per-warehouse stock when the take is scoped to a warehouse, marks adjusted lines, and completes the take. The take must be 'in_progress'. Returns the completed stock take, the number of lines adjusted, and the posted journalEntryIds.",
    {
      stockTakeId: z.string().uuid().describe("UUID of the in-progress stock take to apply"),
      date: z
        .string()
        .optional()
        .describe("Posting date for the adjustment entries (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const st = await db.query.stockTake.findFirst({
          where: and(
            eq(stockTake.id, params.stockTakeId),
            eq(stockTake.organizationId, ctx.organizationId)
          ),
          with: { lines: true },
        });
        if (!st) throw new Error("Stock take not found");
        if (st.status !== "in_progress") {
          throw new Error("Stock take must be in progress to apply adjustments");
        }

        const date = params.date || new Date().toISOString().slice(0, 10);

        // Only lines that were counted and actually differ need a true-up.
        const linesToAdjust = st.lines.filter(
          (line) => line.countedQuantity !== null && (line.discrepancy ?? 0) !== 0
        );

        const result = await db.transaction(async (tx) => {
          const journalEntryIds: string[] = [];
          let adjustedCount = 0;

          for (const line of linesToAdjust) {
            const item = await tx.query.inventoryItem.findFirst({
              where: and(
                eq(inventoryItem.id, line.inventoryItemId),
                eq(inventoryItem.organizationId, ctx.organizationId)
              ),
            });
            if (!item) continue;

            const qtyDelta = line.countedQuantity! - item.quantityOnHand;
            if (qtyDelta === 0) continue;

            // Post the shrinkage/found GL + valuation change via the shared
            // helper (this writes its own movement + updates quantityOnHand).
            const adj = await createInventoryAdjustmentJournalEntry(
              { organizationId: ctx.organizationId, userId: ctx.userId },
              {
                item: item as ValuedItem & { inventoryAccountId?: string | null },
                qtyDelta,
                reason: `Stock take: ${st.name}`,
                date,
              },
              tx
            );
            if (adj?.entryId) journalEntryIds.push(adj.entryId);

            // Stamp the helper's movement with the stock-take reference and tag
            // it as a stock_take movement for the audit trail.
            if (adj?.movementId) {
              await tx
                .update(inventoryMovement)
                .set({
                  type: "stock_take",
                  referenceType: "stock_take",
                  referenceId: st.id,
                  reason: `Stock take: ${st.name}`,
                })
                .where(eq(inventoryMovement.id, adj.movementId));
            }

            // Sync per-warehouse stock when the take is warehouse-scoped.
            if (st.warehouseId) {
              await tx
                .insert(warehouseStock)
                .values({
                  organizationId: ctx.organizationId,
                  inventoryItemId: line.inventoryItemId,
                  warehouseId: st.warehouseId,
                  quantity: line.countedQuantity!,
                })
                .onConflictDoUpdate({
                  target: [warehouseStock.organizationId, warehouseStock.inventoryItemId, warehouseStock.warehouseId],
                  set: { quantity: line.countedQuantity!, updatedAt: new Date() },
                });
            }

            await tx
              .update(stockTakeLine)
              .set({
                adjusted: true,
                journalEntryId: adj?.entryId ?? null,
                updatedAt: new Date(),
              })
              .where(eq(stockTakeLine.id, line.id));

            adjustedCount++;
          }

          await tx
            .update(stockTake)
            .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
            .where(eq(stockTake.id, st.id));

          return { adjustedCount, journalEntryIds };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "apply_stock_take",
          entityType: "stock_take",
          entityId: st.id,
          changes: {
            adjustedCount: result.adjustedCount,
            journalEntryIds: result.journalEntryIds,
          },
        });

        const updatedSt = await db.query.stockTake.findFirst({
          where: eq(stockTake.id, st.id),
          with: {
            lines: {
              with: { inventoryItem: { columns: { id: true, name: true, code: true } } },
            },
          },
        });

        return {
          stockTake: updatedSt,
          adjustedCount: result.adjustedCount,
          journalEntryIds: result.journalEntryIds,
        };
      })
  );

  // ─── Build assembly ───────────────────────────────────────────────
  server.tool(
    "build_assembly",
    "Complete (build) a draft/in-progress assembly order: issues every BOM component at its current cost (incl. wastage), adds the BOM's labor + overhead (in cents, scaled by build quantity), and receives the finished assembly item at the rolled-up unit cost. Posts ONE balanced journal entry (DR Finished Goods inventory; CR each consumed component's inventory account; CR Manufacturing/WIP Clearing 2305 for labor & overhead), updates perpetual valuation for all items, and marks the order completed. Validates on-hand stock for every component BEFORE writing anything. Returns the completed order, the posted journalEntryId, and the totalCost/unitCost (cents).",
    {
      assemblyOrderId: z.string().uuid().describe("UUID of the draft/in-progress assembly order to build"),
      date: z
        .string()
        .optional()
        .describe("Posting date for the build journal entry (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const order = await db.query.assemblyOrder.findFirst({
          where: and(
            eq(assemblyOrder.id, params.assemblyOrderId),
            eq(assemblyOrder.organizationId, ctx.organizationId),
            notDeleted(assemblyOrder.deletedAt)
          ),
          with: {
            bom: {
              with: {
                assemblyItem: true,
                components: { with: { componentItem: true } },
              },
            },
          },
        });

        if (!order) throw new Error("Assembly order not found");
        if (order.status === "completed") throw new Error("Order already completed");
        if (order.status === "cancelled") throw new Error("Order is cancelled");

        const bom = order.bom;
        if (!bom.assemblyItem) throw new Error("BOM has no assembly item");
        if (bom.components.length === 0) throw new Error("BOM has no components");

        // Resolve per-component required quantity (incl. wastage) and validate
        // on-hand BEFORE writing anything so a build never leaves stock half-consumed.
        const needs = bom.components.map((comp) => {
          const needed = Math.ceil(
            parseFloat(comp.quantity) *
              order.quantity *
              (1 + parseFloat(comp.wastagePercent || "0") / 100)
          );
          return { comp, item: comp.componentItem, needed };
        });

        for (const { comp, item, needed } of needs) {
          if (!item) throw new Error(`Component item missing for BOM line ${comp.id}`);
          if (item.quantityOnHand < needed) {
            throw new Error(
              `Insufficient stock for ${item.name}: need ${needed}, have ${item.quantityOnHand}`
            );
          }
        }

        const date = params.date || new Date().toISOString().slice(0, 10);

        const result = await db.transaction(async (tx) => {
          const { base } = await resolveBaseRate(ctx.organizationId, undefined, date);

          // 1. Issue every component at its current cost.
          const componentMovementIds: string[] = [];
          const componentCredits = new Map<string, number>(); // inventory accountId -> cost
          let componentCost = 0;

          for (const { item, needed } of needs) {
            const valued = item as unknown as ValuedItem;
            const issue = await recordInventoryIssue(tx, {
              item: valued,
              quantity: needed,
              type: "adjustment",
              referenceType: "assembly_order",
              referenceId: order.id,
              createdBy: ctx.userId,
            });
            componentCost += issue.cost;
            componentMovementIds.push(issue.movementId);

            const invAcct = item!.inventoryAccountId
              ? { id: item!.inventoryAccountId }
              : await ensureControlAccount(ctx.organizationId, "inventory", base, tx);
            if (!invAcct) throw new Error("Inventory control account unavailable");
            componentCredits.set(invAcct.id, (componentCredits.get(invAcct.id) ?? 0) + issue.cost);
          }

          // 2. Labor + overhead from the BOM, scaled by build quantity.
          const conversionCost = (bom.laborCostCents + bom.overheadCostCents) * order.quantity;
          const totalCost = componentCost + conversionCost;

          // 3. Receive the finished item at the rolled-up unit cost.
          const assemblyValued = bom.assemblyItem as unknown as ValuedItem;
          const unitCost = order.quantity > 0 ? Math.round(totalCost / order.quantity) : 0;
          const receipt = await recordInventoryReceipt(tx, {
            item: assemblyValued,
            quantity: order.quantity,
            unitCost,
            type: "adjustment",
            referenceType: "assembly_order",
            referenceId: order.id,
            createdBy: ctx.userId,
          });

          const finishedValue = unitCost * order.quantity;

          // 4. Build the balanced JE.
          const finishedAcct = bom.assemblyItem!.inventoryAccountId
            ? { id: bom.assemblyItem!.inventoryAccountId }
            : await ensureAccountByCode(
                ctx.organizationId,
                { code: "1320", name: "Finished Goods", type: "asset", subType: "current" },
                base,
                tx
              );
          if (!finishedAcct) throw new Error("Finished goods account unavailable");

          const creditedComponentCost = Array.from(componentCredits.values()).reduce((s, v) => s + v, 0);
          const clearingCredit = finishedValue - creditedComponentCost;

          const lines: {
            accountId: string;
            description: string;
            debitAmount: number;
            creditAmount: number;
            currencyCode: string;
          }[] = [
            {
              accountId: finishedAcct.id,
              description: `Assembly build: ${bom.name} x${order.quantity}`,
              debitAmount: finishedValue,
              creditAmount: 0,
              currencyCode: base,
            },
          ];

          for (const [accountId, amount] of componentCredits) {
            if (amount === 0) continue;
            lines.push({
              accountId,
              description: `Components consumed: ${bom.name}`,
              debitAmount: 0,
              creditAmount: amount,
              currencyCode: base,
            });
          }

          if (clearingCredit !== 0) {
            const clearingAcct = await ensureAccountByCode(
              ctx.organizationId,
              { code: "2305", name: "Manufacturing/WIP Clearing", type: "liability", subType: "current" },
              base,
              tx
            );
            if (!clearingAcct) throw new Error("WIP clearing account unavailable");
            lines.push({
              accountId: clearingAcct.id,
              description: `Labor & overhead applied: ${bom.name}`,
              debitAmount: clearingCredit < 0 ? -clearingCredit : 0,
              creditAmount: clearingCredit > 0 ? clearingCredit : 0,
              currencyCode: base,
            });
          }

          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date,
              description: `Assembly build: ${bom.name} x${order.quantity}`,
              reference: "ASSEMBLY",
              status: "posted",
              sourceType: "assembly_build",
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(journalLine).values(lines.map((l) => ({ ...l, journalEntryId: entry.id })));

          // 5. Stamp every movement with the JE id.
          for (const movementId of [...componentMovementIds, receipt.movementId]) {
            await tx
              .update(inventoryMovement)
              .set({ journalEntryId: entry.id })
              .where(eq(inventoryMovement.id, movementId));
          }

          // 6. Mark the order complete.
          const [updated] = await tx
            .update(assemblyOrder)
            .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
            .where(eq(assemblyOrder.id, order.id))
            .returning();

          return { updated, entryId: entry.id, totalCost, unitCost };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "build_assembly",
          entityType: "assembly_order",
          entityId: order.id,
          changes: {
            quantity: order.quantity,
            totalCost: result.totalCost,
            unitCost: result.unitCost,
            journalEntryId: result.entryId,
          },
        });

        return {
          order: result.updated,
          journalEntryId: result.entryId,
          totalCost: result.totalCost,
          unitCost: result.unitCost,
        };
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
    "Create an inventory item (product). code and name are required; code must be unique within the org. purchasePrice and salePrice are integer cents (e.g. $12.50 = 1250). If quantityOnHand > 0 AND purchasePrice > 0, the opening stock is received through the valuation path (setting averageCost / totalValue) and a balanced opening-balance journal entry is posted (DR Inventory / CR Opening Balance Equity 3000); otherwise the item is created at zero on-hand and zero value (storing a quantity without a cost would leave stock at $0 and post $0 COGS on later sales). Returns the created item.",
    {
      code: z.string().min(1).describe("Item code (unique within the org)"),
      name: z.string().min(1).describe("Item name"),
      description: z.string().nullable().optional().describe("Optional longer description"),
      category: z.string().nullable().optional().describe("Optional free-text category label"),
      categoryId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Optional inventory category UUID"),
      sku: z.string().nullable().optional().describe("Optional stock-keeping unit"),
      purchasePrice: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Purchase/cost price in integer cents (default 0); also the unit cost used for any opening stock"),
      salePrice: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Sale price in integer cents (default 0)"),
      costAccountId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional COGS/cost chart-account UUID"),
      revenueAccountId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional revenue chart-account UUID"),
      inventoryAccountId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional inventory asset chart-account UUID; falls back to the inventory control account for opening-stock posting"),
      quantityOnHand: z
        .number()
        .int()
        .optional()
        .default(0)
        .describe("Opening on-hand quantity in whole units (default 0); only received as stock when purchasePrice > 0"),
      reorderPoint: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Reorder point in whole units (default 0)"),
      isActive: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the item is active (default true)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const openingQty = params.quantityOnHand ?? 0;
        const unitCost = params.purchasePrice ?? 0;
        const hasOpeningStock = openingQty > 0 && unitCost > 0;

        const created = await db.transaction(async (tx) => {
          // Insert at zero on-hand/value, then add any opening stock through the
          // valuation path so averageCost / totalValue / FIFO layers are set.
          const [item] = await tx
            .insert(inventoryItem)
            .values({
              organizationId: ctx.organizationId,
              code: params.code,
              name: params.name,
              description: params.description ?? null,
              category: params.category ?? null,
              categoryId: params.categoryId ?? null,
              sku: params.sku ?? null,
              purchasePrice: params.purchasePrice,
              salePrice: params.salePrice,
              costAccountId: params.costAccountId ?? null,
              revenueAccountId: params.revenueAccountId ?? null,
              inventoryAccountId: params.inventoryAccountId ?? null,
              reorderPoint: params.reorderPoint,
              isActive: params.isActive,
              quantityOnHand: 0,
              averageCost: 0,
              totalValue: 0,
            })
            .returning();

          if (hasOpeningStock) {
            await recordInventoryReceipt(tx, {
              item: item as ValuedItem,
              quantity: openingQty,
              unitCost,
              type: "initial",
              referenceType: "opening_balance",
              referenceId: item.id,
              createdBy: ctx.userId,
            });

            // Post the opening balance to the GL: DR Inventory / CR Opening
            // Balance Equity (the standard counter-account for starting balances).
            const today = new Date().toISOString().slice(0, 10);
            const { base } = await resolveBaseRate(ctx.organizationId, undefined, today);
            const invAcct =
              (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
              (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
            const openingEquity = await ensureAccountByCode(
              ctx.organizationId,
              { code: "3000", name: "Opening Balance Equity", type: "equity", subType: "other_equity" },
              base,
              tx
            );
            const value = openingQty * unitCost;
            if (invAcct?.id && openingEquity?.id && value > 0) {
              const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
              const [entry] = await tx
                .insert(journalEntry)
                .values({
                  organizationId: ctx.organizationId,
                  entryNumber,
                  date: today,
                  description: `Opening stock: ${item.name}`,
                  reference: item.sku ?? null,
                  status: "posted",
                  sourceType: "inventory_opening",
                  sourceId: item.id,
                  postedAt: new Date(),
                  createdBy: ctx.userId,
                })
                .returning();
              await tx.insert(journalLine).values([
                { journalEntryId: entry.id, accountId: invAcct.id, description: `Opening stock: ${item.name}`, debitAmount: value, creditAmount: 0, currencyCode: base },
                { journalEntryId: entry.id, accountId: openingEquity.id, description: `Opening stock: ${item.name}`, debitAmount: 0, creditAmount: value, currencyCode: base },
              ]);
            }
          }

          return (
            (await tx.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, item.id) })) ?? item
          );
        });

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
    "Update an inventory item's master fields (not stock). Only the fields you pass are changed. purchasePrice and salePrice are integer cents. This does NOT change quantityOnHand, averageCost, or totalValue — use adjust_inventory_stock to change quantity or value. Returns the updated item.",
    {
      inventoryItemId: z.string().uuid().describe("The UUID of the inventory item to update"),
      code: z.string().min(1).optional().describe("Item code (unique within the org)"),
      name: z.string().min(1).optional().describe("Item name"),
      description: z.string().nullable().optional().describe("Longer description (null to clear)"),
      category: z.string().nullable().optional().describe("Free-text category label (null to clear)"),
      categoryId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Inventory category UUID (null to clear)"),
      sku: z.string().nullable().optional().describe("Stock-keeping unit (null to clear)"),
      purchasePrice: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Purchase/cost price in integer cents"),
      salePrice: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Sale price in integer cents"),
      costAccountId: z
        .string()
        .nullable()
        .optional()
        .describe("COGS/cost chart-account UUID (null to clear)"),
      revenueAccountId: z
        .string()
        .nullable()
        .optional()
        .describe("Revenue chart-account UUID (null to clear)"),
      inventoryAccountId: z
        .string()
        .nullable()
        .optional()
        .describe("Inventory asset chart-account UUID (null to clear)"),
      reorderPoint: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Reorder point in whole units"),
      isActive: z.boolean().optional().describe("Whether the item is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const { inventoryItemId, ...fields } = params;

        const existing = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        if (!existing) throw new Error("Inventory item not found");

        const [updated] = await db
          .update(inventoryItem)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(inventoryItem.id, inventoryItemId))
          .returning();

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
