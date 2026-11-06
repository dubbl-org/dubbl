import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItem, warehouse } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * A document line points at a stock item or warehouse the caller's
 * organization doesn't own (or that was deleted). REST answers with `status`;
 * MCP tools show the message.
 */
export class LineReferenceError extends Error {
  constructor(
    message: string,
    public status: number = 404
  ) {
    super(message);
    this.name = "LineReferenceError";
  }
}

type StockRefLine = { inventoryItemId?: string | null; warehouseId?: string | null };

/** The distinct, non-empty ids of `key` across the lines. */
export function distinctLineIds(lines: StockRefLine[], key: keyof StockRefLine): string[] {
  return [...new Set(lines.map((l) => l[key]).filter((v): v is string => typeof v === "string" && v.length > 0))];
}

/** Ids that were asked for but not found. */
export function missingIds(requested: string[], found: Iterable<string>): string[] {
  const have = new Set(found);
  return requested.filter((id) => !have.has(id));
}

/**
 * Check every line's stock item and warehouse belongs to this organization
 * before saving invoice, bill, order, quote, credit note or cash sale lines.
 * Throws LineReferenceError (404) naming what wasn't found.
 */
export async function assertLineStockRefs(organizationId: string, lines: StockRefLine[]): Promise<void> {
  const itemIds = distinctLineIds(lines, "inventoryItemId");
  if (itemIds.length > 0) {
    const rows = await db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.organizationId, organizationId),
          inArray(inventoryItem.id, itemIds),
          notDeleted(inventoryItem.deletedAt)
        )
      );
    const missing = missingIds(itemIds, rows.map((r) => r.id));
    if (missing.length > 0) throw new LineReferenceError(`Stock item not found: ${missing.join(", ")}`);
  }
  const warehouseIds = distinctLineIds(lines, "warehouseId");
  if (warehouseIds.length > 0) {
    const rows = await db
      .select({ id: warehouse.id })
      .from(warehouse)
      .where(
        and(
          eq(warehouse.organizationId, organizationId),
          inArray(warehouse.id, warehouseIds),
          notDeleted(warehouse.deletedAt)
        )
      );
    const missing = missingIds(warehouseIds, rows.map((r) => r.id));
    if (missing.length > 0) throw new LineReferenceError(`Warehouse not found: ${missing.join(", ")}`);
  }
}
