import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { warehouse, warehouseStock, inventoryItem, auditLog } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import { createWarehouse, deleteWarehouse, updateWarehouse } from "@/lib/api/warehouses";

/**
 * Warehouse MCP tools.
 *
 * A warehouse is a physical stock location; per-warehouse quantities live on
 * warehouseStock (in whole units, matching inventoryItem.quantityOnHand). There
 * are no monetary fields on a warehouse. All tools are org-scoped via the
 * AuthContext and use direct Drizzle access (no HTTP self-calls). Mutations
 * require the "manage:inventory" permission, mirroring the REST routes.
 */
export function registerWarehouseTools(server: McpServer, ctx: AuthContext) {
  // ─── List warehouses ──────────────────────────────────────────────
  server.tool(
    "list_warehouses",
    "List all warehouses (physical stock locations) for the organization, ordered by name. Returns each warehouse's id, name, code, address, isDefault and isActive flags. Use to find a warehouseId before getting its stock or before transferring inventory.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const items = await db.query.warehouse.findMany({
          where: and(
            eq(warehouse.organizationId, ctx.organizationId),
            notDeleted(warehouse.deletedAt)
          ),
          orderBy: asc(warehouse.name),
        });
        return { warehouses: items };
      })
  );

  // ─── Get warehouse ────────────────────────────────────────────────
  server.tool(
    "get_warehouse",
    "Get a single warehouse by ID. Returns the full warehouse: id, name, code, address, isDefault and isActive flags, and timestamps.",
    {
      warehouseId: z.string().uuid().describe("The UUID of the warehouse"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.warehouse.findFirst({
          where: and(
            eq(warehouse.id, params.warehouseId),
            eq(warehouse.organizationId, ctx.organizationId),
            notDeleted(warehouse.deletedAt)
          ),
        });
        if (!found) throw new Error("Warehouse not found");
        return { warehouse: found };
      })
  );

  // ─── Create warehouse ─────────────────────────────────────────────
  server.tool(
    "create_warehouse",
    "Create a location (warehouse). name and code are required; code must be unique within the org (409 otherwise). Making it the default clears the default flag on the others, so there's only ever one default. There are no monetary fields on a location. Returns the created location.",
    {
      name: z.string().min(1).describe("Warehouse name"),
      code: z.string().min(1).describe("Warehouse code (unique within the org)"),
      address: z
        .string()
        .nullable()
        .optional()
        .describe("Optional physical address of the warehouse"),
      isDefault: z
        .boolean()
        .optional()
        .describe("Whether this is the default location for new stock (default false)"),
      isActive: z.boolean().optional().describe("Whether the location is active (default true); inactive locations can't be the default"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const created = await createWarehouse(ctx.organizationId, {
          name: params.name,
          code: params.code,
          address: params.address ?? null,
          isDefault: params.isDefault,
          isActive: params.isActive,
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "create",
          entityType: "warehouse",
          entityId: created.id,
        });

        return { warehouse: created };
      })
  );

  // ─── Update warehouse ─────────────────────────────────────────────
  server.tool(
    "update_warehouse",
    "Update a location's fields. Only the fields you pass change; code must stay unique within the org. Setting isDefault clears it on the other locations; deactivating a location also stops it being the default. Returns the updated location.",
    {
      warehouseId: z.string().uuid().describe("The UUID of the warehouse to update"),
      name: z.string().min(1).optional().describe("Warehouse name"),
      code: z.string().min(1).optional().describe("Warehouse code (unique within the org)"),
      address: z
        .string()
        .nullable()
        .optional()
        .describe("Physical address of the warehouse (null to clear)"),
      isDefault: z.boolean().optional().describe("Whether this is the default warehouse"),
      isActive: z.boolean().optional().describe("Whether the warehouse is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        const { warehouseId, ...fields } = params;

        const { updated } = await updateWarehouse(ctx.organizationId, warehouseId, fields);

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "update",
          entityType: "warehouse",
          entityId: warehouseId,
          changes: fields,
        });

        return { warehouse: updated };
      })
  );

  // ─── Delete warehouse ─────────────────────────────────────────────
  server.tool(
    "delete_warehouse",
    "Delete a location (moves it to the trash; its stock history is kept). Fails with 409 while the location still holds stock or has open transfers: move the stock out with a transfer first. Returns { success: true }.",
    {
      warehouseId: z.string().uuid().describe("The UUID of the warehouse to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");

        await deleteWarehouse(ctx.organizationId, params.warehouseId);

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "delete",
          entityType: "warehouse",
          entityId: params.warehouseId,
        });

        return { success: true };
      })
  );

  // ─── Get warehouse stock ──────────────────────────────────────────
  server.tool(
    "get_warehouse_stock",
    "List the per-item stock held in a single warehouse. Returns one row per inventory item that has a stock record in this warehouse, each with the inventoryItemId, item name/code/sku, the quantity on hand in that warehouse (whole units), and when it was last updated. Items deleted from inventory are excluded.",
    {
      warehouseId: z.string().uuid().describe("The UUID of the warehouse to read stock for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const stocks = await db
          .select({
            id: warehouseStock.id,
            inventoryItemId: warehouseStock.inventoryItemId,
            itemName: inventoryItem.name,
            itemCode: inventoryItem.code,
            itemSku: inventoryItem.sku,
            quantity: warehouseStock.quantity, // whole units
            updatedAt: warehouseStock.updatedAt,
          })
          .from(warehouseStock)
          .innerJoin(inventoryItem, eq(warehouseStock.inventoryItemId, inventoryItem.id))
          .where(
            and(
              eq(warehouseStock.warehouseId, params.warehouseId),
              eq(warehouseStock.organizationId, ctx.organizationId),
              notDeleted(inventoryItem.deletedAt)
            )
          );

        return { stock: stocks };
      })
  );
}
