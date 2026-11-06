import { db } from "@/lib/db";
import { contact, inventoryItem, inventoryItemSupplier } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { marginPercent, unitBookCost } from "@/lib/inventory/math";

/**
 * Inventory reports shared by the REST routes and the MCP tools.
 * Money is integer cents; quantities are whole units.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  name: inventoryItem.name,
  code: inventoryItem.code,
  quantity: inventoryItem.quantityOnHand,
  quantityOnHand: inventoryItem.quantityOnHand,
};

/**
 * What the stock on hand is worth. Each item is valued by its own costing
 * method (average or FIFO): `totalCost` is its book value, so write-downs,
 * revaluations and landed costs are included. `totalValue` is what it would
 * sell for at today's sale price; `marginPercent` is profit as a share of that.
 */
export async function getInventoryValuation(
  organizationId: string,
  opts: { sortBy?: string; sortOrder?: "asc" | "desc" } = {}
) {
  const sortBy = opts.sortBy || "name";
  const sortOrder = opts.sortOrder || "asc";
  const items = await db.query.inventoryItem.findMany({
    where: and(
      eq(inventoryItem.organizationId, organizationId),
      eq(inventoryItem.isActive, true),
      notDeleted(inventoryItem.deletedAt)
    ),
    orderBy: (sortOrder === "desc" ? desc : asc)(SORT_COLUMNS[sortBy] || inventoryItem.name),
  });

  const rows = items.map((item) => {
    const totalCost = item.totalValue;
    const totalValue = item.quantityOnHand * item.salePrice;
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      costMethod: item.costMethod,
      quantityOnHand: item.quantityOnHand,
      unitCost: unitBookCost(item),
      totalCost,
      salePrice: item.salePrice,
      totalValue,
      margin: totalValue - totalCost,
      marginPercent: marginPercent(totalCost, totalValue) ?? 0,
    };
  });

  if (sortBy === "totalCost" || sortBy === "totalValue" || sortBy === "marginPercent") {
    const mul = sortOrder === "desc" ? -1 : 1;
    rows.sort((a, b) => mul * (a[sortBy] - b[sortBy]));
  }

  const totalCost = rows.reduce((s, i) => s + i.totalCost, 0);
  const totalValue = rows.reduce((s, i) => s + i.totalValue, 0);
  return {
    items: rows,
    summary: {
      totalItems: rows.length,
      totalCost,
      totalValue,
      totalMargin: marginPercent(totalCost, totalValue) ?? 0,
    },
  };
}

/**
 * Active items at or below their reorder point, with a suggested order
 * quantity (enough to get back to twice the reorder point) and their linked
 * suppliers, preferred first. `preferredSupplier` is the first of those.
 */
export async function getReorderSuggestions(organizationId: string) {
  const items = await db.query.inventoryItem.findMany({
    where: and(
      eq(inventoryItem.organizationId, organizationId),
      notDeleted(inventoryItem.deletedAt),
      eq(inventoryItem.isActive, true),
      sql`${inventoryItem.quantityOnHand} <= ${inventoryItem.reorderPoint}`
    ),
    orderBy: asc(inventoryItem.name),
  });
  if (items.length === 0) return [];

  const links = await db
    .select({
      id: inventoryItemSupplier.id,
      inventoryItemId: inventoryItemSupplier.inventoryItemId,
      contactId: inventoryItemSupplier.contactId,
      supplierCode: inventoryItemSupplier.supplierCode,
      leadTimeDays: inventoryItemSupplier.leadTimeDays,
      purchasePrice: inventoryItemSupplier.purchasePrice,
      isPreferred: inventoryItemSupplier.isPreferred,
      contactName: contact.name,
      contactEmail: contact.email,
    })
    .from(inventoryItemSupplier)
    .innerJoin(contact, eq(inventoryItemSupplier.contactId, contact.id))
    .where(
      and(
        eq(inventoryItemSupplier.organizationId, organizationId),
        inArray(inventoryItemSupplier.inventoryItemId, items.map((i) => i.id))
      )
    )
    .orderBy(desc(inventoryItemSupplier.isPreferred), asc(contact.name));

  return items.map((item) => {
    const suppliers = links.filter((l) => l.inventoryItemId === item.id);
    return {
      ...item,
      suggestedReorderQuantity: Math.max(1, item.reorderPoint * 2 - item.quantityOnHand),
      suppliers,
      preferredSupplier: suppliers[0] ?? null,
    };
  });
}
