import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { priceList, priceListItem, inventoryItem } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { resolvePrice } from "@/lib/api/pricing";
import type { AuthContext } from "@/lib/api/auth-context";

// Load a price list owned by the current org, or throw.
async function loadOwnedList(ctx: AuthContext, listId: string) {
  const list = await db.query.priceList.findFirst({
    where: and(
      eq(priceList.id, listId),
      eq(priceList.organizationId, ctx.organizationId),
      notDeleted(priceList.deletedAt)
    ),
  });
  if (!list) throw new Error("Price list not found");
  return list;
}

export function registerPricingTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_price_lists",
    "List the price lists (price books) for this organization. Each price list is currency-scoped (currencyCode) and holds explicit unit prices for inventory items in that currency, supporting cross-currency pricing without FX conversion. Lists may be active/inactive and date-bound (effectiveFrom/effectiveTo). Use this to find a price list's ID before reading or editing its item prices, or before resolving a price.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const lists = await db.query.priceList.findMany({
          where: and(
            eq(priceList.organizationId, ctx.organizationId),
            notDeleted(priceList.deletedAt)
          ),
          orderBy: asc(priceList.name),
        });
        return {
          priceLists: lists.map((l) => ({
            id: l.id,
            name: l.name,
            currencyCode: l.currencyCode,
            isActive: l.isActive,
            effectiveFrom: l.effectiveFrom,
            effectiveTo: l.effectiveTo,
          })),
        };
      })
  );

  server.tool(
    "get_price_list",
    "Get a single price list by ID, including all of its item price rows. Each item row has a unitPrice (in integer cents of the list's currencyCode) and a minQuantity (the quantity-break tier at which that price applies). Amounts are in integer cents of the list's currency.",
    {
      priceListId: z.string().describe("UUID of the price list to fetch"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const list = await loadOwnedList(ctx, params.priceListId);
        const items = await db.query.priceListItem.findMany({
          where: eq(priceListItem.priceListId, list.id),
          with: { inventoryItem: true },
          orderBy: asc(priceListItem.minQuantity),
        });
        return {
          priceList: {
            id: list.id,
            name: list.name,
            currencyCode: list.currencyCode,
            isActive: list.isActive,
            effectiveFrom: list.effectiveFrom,
            effectiveTo: list.effectiveTo,
            items: items.map((i) => ({
              id: i.id,
              inventoryItemId: i.inventoryItemId,
              itemCode: i.inventoryItem?.code,
              itemName: i.inventoryItem?.name,
              unitPrice: i.unitPrice,
              minQuantity: i.minQuantity,
            })),
          },
        };
      })
  );

  server.tool(
    "create_price_list",
    "Create a new price list (price book) for this organization. currencyCode is the ISO currency all prices in the list are denominated in (defaults to USD). Optionally set isActive (default true) and a validity window effectiveFrom/effectiveTo (YYYY-MM-DD; null = unbounded). Returns the created price list. Add item prices afterwards with add_price_list_item.",
    {
      name: z.string().describe("Human-readable name for the price list (e.g. 'Wholesale USD')"),
      currencyCode: z
        .string()
        .optional()
        .describe("ISO currency code the prices are denominated in (defaults to USD)"),
      isActive: z
        .boolean()
        .optional()
        .describe("Whether the list is active and usable for pricing (defaults to true)"),
      effectiveFrom: z
        .string()
        .nullable()
        .optional()
        .describe("Inclusive start date (YYYY-MM-DD) of the list's validity, or null for unbounded"),
      effectiveTo: z
        .string()
        .nullable()
        .optional()
        .describe("Inclusive end date (YYYY-MM-DD) of the list's validity, or null for unbounded"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        const [created] = await db
          .insert(priceList)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            currencyCode: params.currencyCode ?? "USD",
            isActive: params.isActive ?? true,
            effectiveFrom: params.effectiveFrom ?? null,
            effectiveTo: params.effectiveTo ?? null,
          })
          .returning();
        return { priceList: created };
      })
  );

  server.tool(
    "update_price_list",
    "Update a price list's metadata (name, currencyCode, isActive, effectiveFrom/effectiveTo). Only the provided fields are changed. Note: changing currencyCode does not convert existing item prices — they keep their integer-cent values, now interpreted in the new currency. Returns the updated price list.",
    {
      priceListId: z.string().describe("UUID of the price list to update"),
      name: z.string().optional().describe("New name"),
      currencyCode: z.string().optional().describe("New ISO currency code"),
      isActive: z.boolean().optional().describe("New active flag"),
      effectiveFrom: z
        .string()
        .nullable()
        .optional()
        .describe("New inclusive start date (YYYY-MM-DD) or null to clear"),
      effectiveTo: z
        .string()
        .nullable()
        .optional()
        .describe("New inclusive end date (YYYY-MM-DD) or null to clear"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await loadOwnedList(ctx, params.priceListId);
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (params.name !== undefined) updates.name = params.name;
        if (params.currencyCode !== undefined) updates.currencyCode = params.currencyCode;
        if (params.isActive !== undefined) updates.isActive = params.isActive;
        if (params.effectiveFrom !== undefined) updates.effectiveFrom = params.effectiveFrom;
        if (params.effectiveTo !== undefined) updates.effectiveTo = params.effectiveTo;

        const [updated] = await db
          .update(priceList)
          .set(updates)
          .where(
            and(
              eq(priceList.id, params.priceListId),
              eq(priceList.organizationId, ctx.organizationId),
              notDeleted(priceList.deletedAt)
            )
          )
          .returning();
        return { priceList: updated };
      })
  );

  server.tool(
    "delete_price_list",
    "Soft-delete a price list. The list and its prices stop being available for pricing but the record is retained. Returns the deleted list ID.",
    {
      priceListId: z.string().describe("UUID of the price list to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await loadOwnedList(ctx, params.priceListId);
        await db
          .update(priceList)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(priceList.id, params.priceListId),
              eq(priceList.organizationId, ctx.organizationId)
            )
          );
        return { success: true, deletedPriceListId: params.priceListId };
      })
  );

  server.tool(
    "add_price_list_item",
    "Add an item's unit price to a price list. unitPrice is in integer cents of the list's currency (e.g. $12.50 = 1250). minQuantity is the quantity-break tier the price applies at (defaults to 1); add multiple rows for the same item with ascending minQuantity to model volume tiers. The inventory item must belong to this organization, and each (list, item, minQuantity) combination must be unique. Returns the created price row.",
    {
      priceListId: z.string().describe("UUID of the price list to add to"),
      inventoryItemId: z.string().describe("UUID of the inventory item to price"),
      unitPrice: z
        .number()
        .int()
        .min(0)
        .describe("Unit price in integer cents of the list's currency (e.g. 1250 = $12.50)"),
      minQuantity: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Minimum order quantity at which this price applies (quantity-break tier; defaults to 1)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await loadOwnedList(ctx, params.priceListId);

        const item = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, params.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        if (!item) throw new Error("Inventory item not found");

        const minQuantity = params.minQuantity ?? 1;

        const existing = await db.query.priceListItem.findFirst({
          where: and(
            eq(priceListItem.priceListId, params.priceListId),
            eq(priceListItem.inventoryItemId, params.inventoryItemId),
            eq(priceListItem.minQuantity, minQuantity)
          ),
        });
        if (existing) {
          throw new Error(
            "A price already exists for this item at this minimum quantity"
          );
        }

        const [created] = await db
          .insert(priceListItem)
          .values({
            priceListId: params.priceListId,
            inventoryItemId: params.inventoryItemId,
            unitPrice: params.unitPrice,
            minQuantity,
          })
          .returning();
        return { priceListItem: created };
      })
  );

  server.tool(
    "update_price_list_item",
    "Update an existing price row in a price list (unitPrice in integer cents and/or its minQuantity tier). Only provided fields change. The (list, item, minQuantity) combination must remain unique. Returns the updated price row.",
    {
      priceListId: z.string().describe("UUID of the price list the row belongs to"),
      priceListItemId: z.string().describe("UUID of the price row to update"),
      unitPrice: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("New unit price in integer cents of the list's currency"),
      minQuantity: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("New quantity-break tier (minimum order quantity)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await loadOwnedList(ctx, params.priceListId);

        const row = await db.query.priceListItem.findFirst({
          where: and(
            eq(priceListItem.id, params.priceListItemId),
            eq(priceListItem.priceListId, params.priceListId)
          ),
        });
        if (!row) throw new Error("Price list item not found");

        if (
          params.minQuantity !== undefined &&
          params.minQuantity !== row.minQuantity
        ) {
          const clash = await db.query.priceListItem.findFirst({
            where: and(
              eq(priceListItem.priceListId, params.priceListId),
              eq(priceListItem.inventoryItemId, row.inventoryItemId),
              eq(priceListItem.minQuantity, params.minQuantity)
            ),
          });
          if (clash) {
            throw new Error(
              "A price already exists for this item at this minimum quantity"
            );
          }
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (params.unitPrice !== undefined) updates.unitPrice = params.unitPrice;
        if (params.minQuantity !== undefined) updates.minQuantity = params.minQuantity;

        const [updated] = await db
          .update(priceListItem)
          .set(updates)
          .where(eq(priceListItem.id, params.priceListItemId))
          .returning();
        return { priceListItem: updated };
      })
  );

  server.tool(
    "delete_price_list_item",
    "Remove an item's price row from a price list. Returns the deleted row ID.",
    {
      priceListId: z.string().describe("UUID of the price list the row belongs to"),
      priceListItemId: z.string().describe("UUID of the price row to remove"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:inventory");
        await loadOwnedList(ctx, params.priceListId);

        const [deleted] = await db
          .delete(priceListItem)
          .where(
            and(
              eq(priceListItem.id, params.priceListItemId),
              eq(priceListItem.priceListId, params.priceListId)
            )
          )
          .returning();
        if (!deleted) throw new Error("Price list item not found");
        return { success: true, deletedPriceListItemId: params.priceListItemId };
      })
  );

  server.tool(
    "resolve_price",
    "Resolve the unit price (in integer cents of the price list's currency) for an inventory item from a specific price list, at a given order quantity. Honours quantity-break tiers (picks the highest minQuantity tier that is <= the quantity) and the list's active flag and effectiveFrom/effectiveTo validity window. Returns null when the list is missing/inactive/out-of-window or the item has no qualifying tier. This is a read-only lookup and performs NO FX conversion (the price is in the list's own currency).",
    {
      inventoryItemId: z.string().describe("UUID of the inventory item to price"),
      priceListId: z.string().describe("UUID of the price list to resolve against"),
      quantity: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Order quantity used to select the quantity-break tier (defaults to 1)"),
      asOf: z
        .string()
        .optional()
        .describe("Date (YYYY-MM-DD) to evaluate the list's validity window against (defaults to today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Ownership check (also makes a missing/foreign list return null cleanly).
        await loadOwnedList(ctx, params.priceListId);
        const resolved = await resolvePrice(
          ctx.organizationId,
          params.inventoryItemId,
          params.priceListId,
          params.quantity ?? 1,
          params.asOf
        );
        return { resolved };
      })
  );
}
