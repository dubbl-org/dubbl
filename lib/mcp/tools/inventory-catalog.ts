import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { inventoryCategory, inventoryItem, inventoryVariant } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { fail } from "@/lib/api/inventory-ops";
import { createCategory, deleteCategory, updateCategory } from "@/lib/api/inventory-categories";
import { linkItemSupplier, listItemSuppliers, unlinkItemSupplier, updateItemSupplier } from "@/lib/api/inventory-suppliers";
import { getInventoryValuation, getReorderSuggestions } from "@/lib/api/inventory-reports";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Inventory catalogue MCP tools: categories, variants, item suppliers, reorder
 * alerts and the stock valuation report. Money is integer cents; quantities
 * are whole units. Same services as the REST routes.
 */
export function registerInventoryCatalogTools(server: McpServer, ctx: AuthContext) {
  // ─── Categories ───────────────────────────────────────────────────
  server.tool(
    "list_inventory_categories",
    "List inventory categories as a tree (top-level categories with their children; one level deep). Returns { categories } where each has id, name, color, description, parentId and children. Use a category id as categoryId on create_inventory_item / update_inventory_item.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const rows = await db.query.inventoryCategory.findMany({
          where: and(eq(inventoryCategory.organizationId, ctx.organizationId), notDeleted(inventoryCategory.deletedAt)),
          orderBy: asc(inventoryCategory.name),
        });
        return {
          categories: rows.filter((c) => !c.parentId).map((c) => ({ ...c, children: rows.filter((x) => x.parentId === c.id) })),
        };
      })
  );

  server.tool(
    "create_inventory_category",
    "Create an inventory category. Names are unique per organization (409 on a duplicate); a deleted category with the same name is restored. parentId must be a top-level category (one level of nesting). Returns the category.",
    {
      name: z.string().min(1).describe("Category name"),
      color: z.string().nullable().optional().describe("Optional hex color, e.g. '#0EA5E9'"),
      description: z.string().nullable().optional().describe("Optional description"),
      parentId: z.string().uuid().nullable().optional().describe("Optional top-level parent category UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { category: await createCategory(ctx.organizationId, params) };
      })
  );

  server.tool(
    "update_inventory_category",
    "Rename or change an inventory category. A rename is copied onto every item in it. A category with sub-categories can't be moved under another. Returns the category.",
    {
      categoryId: z.string().uuid().describe("UUID of the category"),
      name: z.string().min(1).optional().describe("New name (unique per organization)"),
      color: z.string().nullable().optional().describe("Hex color (null to clear)"),
      description: z.string().nullable().optional().describe("Description (null to clear)"),
      parentId: z.string().uuid().nullable().optional().describe("Top-level parent category UUID (null for top level)"),
    },
    ({ categoryId, ...fields }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const category = await updateCategory(ctx.organizationId, categoryId, fields);
        if (!category) fail("Category not found", 404);
        return { category };
      })
  );

  server.tool(
    "delete_inventory_category",
    "Delete an inventory category. Its items become uncategorised and its sub-categories move to the top level. Returns { success: true }.",
    { categoryId: z.string().uuid().describe("UUID of the category") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const deleted = await db.transaction((tx) => deleteCategory(tx, ctx.organizationId, params.categoryId));
        if (!deleted) fail("Category not found", 404);
        return { success: true };
      })
  );

  // ─── Variants ─────────────────────────────────────────────────────
  async function assertItem(itemId: string) {
    const item = await db.query.inventoryItem.findFirst({
      where: and(eq(inventoryItem.id, itemId), eq(inventoryItem.organizationId, ctx.organizationId), notDeleted(inventoryItem.deletedAt)),
      columns: { id: true },
    });
    if (!item) fail("Inventory item not found", 404);
  }

  async function loadVariant(itemId: string, variantId: string) {
    const variant = await db.query.inventoryVariant.findFirst({
      where: and(
        eq(inventoryVariant.id, variantId),
        eq(inventoryVariant.inventoryItemId, itemId),
        eq(inventoryVariant.organizationId, ctx.organizationId),
        notDeleted(inventoryVariant.deletedAt)
      ),
    });
    if (!variant) fail("Variant not found", 404);
    return variant;
  }

  server.tool(
    "list_inventory_variants",
    "List the variants (sizes, colors and other versions) of an inventory item. Prices are integer cents. A variant's quantityOnHand is for reference only: it doesn't change the item's stock or the books. Returns { variants }.",
    { inventoryItemId: z.string().uuid().describe("UUID of the inventory item") },
    (params) =>
      wrapTool(ctx, async () => {
        await assertItem(params.inventoryItemId);
        const variants = await db.query.inventoryVariant.findMany({
          where: and(
            eq(inventoryVariant.inventoryItemId, params.inventoryItemId),
            eq(inventoryVariant.organizationId, ctx.organizationId),
            notDeleted(inventoryVariant.deletedAt)
          ),
          orderBy: asc(inventoryVariant.name),
        });
        return { variants };
      })
  );

  const variantFields = {
    sku: z.string().nullable().optional().describe("Variant SKU"),
    purchasePrice: z.number().int().min(0).optional().describe("Purchase price in integer cents"),
    salePrice: z.number().int().min(0).optional().describe("Sale price in integer cents"),
    quantityOnHand: z.number().int().min(0).optional().describe("Reference count in whole units (doesn't change item stock)"),
    options: z.record(z.string(), z.string()).optional().describe("Option values, e.g. { \"Color\": \"Red\", \"Size\": \"Large\" }"),
  };

  server.tool(
    "create_inventory_variant",
    "Add a variant to an inventory item (e.g. 'Red / Large'). Prices are integer cents. Returns the variant.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item"),
      name: z.string().min(1).describe("Variant name, e.g. 'Red / Large'"),
      ...variantFields,
    },
    ({ inventoryItemId, ...fields }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await assertItem(inventoryItemId);
        const [variant] = await db
          .insert(inventoryVariant)
          .values({ organizationId: ctx.organizationId, inventoryItemId, ...fields, options: fields.options ?? {} })
          .returning();
        return { variant };
      })
  );

  server.tool(
    "update_inventory_variant",
    "Change a variant of an inventory item. Only the fields you pass change; prices are integer cents. Returns the variant.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item"),
      variantId: z.string().uuid().describe("UUID of the variant"),
      name: z.string().min(1).optional().describe("Variant name"),
      isActive: z.boolean().optional().describe("Whether the variant is active"),
      ...variantFields,
    },
    ({ inventoryItemId, variantId, ...fields }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await assertItem(inventoryItemId);
        await loadVariant(inventoryItemId, variantId);
        const [variant] = await db
          .update(inventoryVariant)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(inventoryVariant.id, variantId))
          .returning();
        return { variant };
      })
  );

  server.tool(
    "delete_inventory_variant",
    "Delete a variant of an inventory item (moves it to the trash). Returns { success: true }.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item"),
      variantId: z.string().uuid().describe("UUID of the variant"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await assertItem(params.inventoryItemId);
        await loadVariant(params.inventoryItemId, params.variantId);
        await db.update(inventoryVariant).set(softDelete()).where(eq(inventoryVariant.id, params.variantId));
        return { success: true };
      })
  );

  // ─── Suppliers ────────────────────────────────────────────────────
  server.tool(
    "list_inventory_item_suppliers",
    "List the suppliers linked to an inventory item, preferred first: contact, their item code, lead time in days and purchase price in integer cents. Returns { suppliers } (each has a link id used by the update/unlink tools).",
    { inventoryItemId: z.string().uuid().describe("UUID of the inventory item") },
    (params) =>
      wrapTool(ctx, async () => ({ suppliers: await listItemSuppliers(ctx.organizationId, params.inventoryItemId) }))
  );

  server.tool(
    "link_inventory_item_supplier",
    "Link a supplier (a contact) to an inventory item. Marking it preferred un-marks the item's other suppliers; the preferred supplier is shown on reorder alerts and pre-filled on reorder purchase orders. purchasePrice is integer cents. Returns the link.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item"),
      contactId: z.string().uuid().describe("UUID of the supplier contact"),
      supplierCode: z.string().nullable().optional().describe("The supplier's own code for this item"),
      leadTimeDays: z.number().int().min(0).optional().describe("Days from order to delivery"),
      purchasePrice: z.number().int().min(0).optional().describe("This supplier's price per unit in integer cents"),
      isPreferred: z.boolean().optional().describe("Make this the item's preferred supplier"),
    },
    ({ inventoryItemId, ...input }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { supplier: await linkItemSupplier(ctx, inventoryItemId, input) };
      })
  );

  server.tool(
    "update_inventory_item_supplier",
    "Change a supplier link on an inventory item: code, lead time, price (integer cents) or preferred flag (only one preferred per item). Returns the link.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item"),
      supplierLinkId: z.string().uuid().describe("UUID of the supplier link (from list_inventory_item_suppliers)"),
      supplierCode: z.string().nullable().optional().describe("The supplier's own code for this item"),
      leadTimeDays: z.number().int().min(0).optional().describe("Days from order to delivery"),
      purchasePrice: z.number().int().min(0).optional().describe("Price per unit in integer cents"),
      isPreferred: z.boolean().optional().describe("Whether this is the preferred supplier"),
    },
    ({ inventoryItemId, supplierLinkId, ...input }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        return { supplier: await updateItemSupplier(ctx, inventoryItemId, supplierLinkId, input) };
      })
  );

  server.tool(
    "unlink_inventory_item_supplier",
    "Remove a supplier link from an inventory item (the contact itself is kept). Returns { success: true }.",
    {
      inventoryItemId: z.string().uuid().describe("UUID of the inventory item"),
      supplierLinkId: z.string().uuid().describe("UUID of the supplier link"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await unlinkItemSupplier(ctx, params.inventoryItemId, params.supplierLinkId);
        return { success: true };
      })
  );

  // ─── Reports ──────────────────────────────────────────────────────
  server.tool(
    "list_reorder_alerts",
    "List active items at or below their reorder point, with suggestedReorderQuantity (enough to get back to twice the reorder point), their suppliers (preferred first) and preferredSupplier. Use with create_purchase_order to reorder. Quantities are whole units; prices integer cents.",
    {},
    () => wrapTool(ctx, async () => ({ items: await getReorderSuggestions(ctx.organizationId) }))
  );

  server.tool(
    "get_inventory_valuation",
    "Stock valuation report for active items. Per item: quantityOnHand, unitCost (book cost per unit), totalCost (book value, including write-downs, revaluations and landed costs), salePrice, totalValue (what it would sell for at today's sale price), margin and marginPercent (profit as a share of the sale value). Summary: totalItems, totalCost, totalValue, totalMargin (percent). Money is integer cents.",
    {
      sortBy: z.enum(["name", "code", "quantity", "totalCost", "totalValue", "marginPercent"]).optional().describe("Sort field (default name)"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction (default asc)"),
    },
    (params) => wrapTool(ctx, async () => getInventoryValuation(ctx.organizationId, params))
  );
}
