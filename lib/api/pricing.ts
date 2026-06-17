import { db } from "@/lib/db";
import { priceList, priceListItem } from "@/lib/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

export interface ResolvedPrice {
  /** Unit price in integer cents of the price list's currency. */
  unitPrice: number;
  /** ISO currency code the price is denominated in. */
  currencyCode: string;
  /** The price list the price came from. */
  priceListId: string;
  /** The matched quantity-break tier (minQuantity of the winning row). */
  minQuantity: number;
}

/**
 * Resolve the unit price (integer cents) for an inventory item from a specific
 * price list, honouring quantity-break tiers and the list's validity window.
 *
 * Picks the price-list-item row for the item whose minQuantity is the highest
 * value that is still <= qty (i.e. the volume tier the order qualifies for).
 *
 * Returns null when:
 *  - the list does not exist / is not owned by orgId / is soft-deleted,
 *  - the list is inactive or outside its effectiveFrom/effectiveTo window (as
 *    of `asOf`, default today), or
 *  - the item has no qualifying tier in the list at this quantity.
 *
 * This is a read-only resolver for later wiring into invoice/quote line
 * pricing; it performs no FX conversion (the caller works in the list's own
 * currencyCode).
 *
 * @param orgId        Organization that must own the price list.
 * @param itemId       Inventory item to price.
 * @param priceListId  Price list to resolve against.
 * @param qty          Order quantity (used to select the quantity-break tier). Defaults to 1.
 * @param asOf         Date (YYYY-MM-DD) to evaluate the list's validity window against. Defaults to today.
 */
export async function resolvePrice(
  orgId: string,
  itemId: string,
  priceListId: string,
  qty = 1,
  asOf?: string
): Promise<ResolvedPrice | null> {
  const list = await db.query.priceList.findFirst({
    where: and(
      eq(priceList.id, priceListId),
      eq(priceList.organizationId, orgId),
      notDeleted(priceList.deletedAt)
    ),
  });
  if (!list || !list.isActive) return null;

  // Validity window check (inclusive). Compare on YYYY-MM-DD strings.
  const today = asOf || new Date().toISOString().slice(0, 10);
  if (list.effectiveFrom && today < list.effectiveFrom) return null;
  if (list.effectiveTo && today > list.effectiveTo) return null;

  // All tiers for the item that the order quantity qualifies for, highest tier first.
  const tiers = await db.query.priceListItem.findMany({
    where: and(
      eq(priceListItem.priceListId, priceListId),
      eq(priceListItem.inventoryItemId, itemId),
      lte(priceListItem.minQuantity, qty)
    ),
    orderBy: (t, { desc }) => [desc(t.minQuantity)],
  });

  const tier = tiers[0];
  if (!tier) return null;

  return {
    unitPrice: tier.unitPrice,
    currencyCode: list.currencyCode,
    priceListId: list.id,
    minQuantity: tier.minQuantity,
  };
}
