/**
 * Pure inventory math (no database access), shared by the REST routes, the MCP
 * tools and the unit tests. Money is integer cents; quantities are whole units.
 */

/**
 * Split `amount` cents across `bases` in proportion, so the parts always add up
 * to exactly `amount`. Rounding leftovers go to the parts with the largest
 * fractional remainders (largest-remainder method). A zero or negative total
 * basis returns all zeros.
 */
export function splitByBasis(amount: number, bases: number[]): number[] {
  const total = bases.reduce((s, b) => s + Math.max(0, b), 0);
  if (total <= 0 || amount === 0) return bases.map(() => 0);
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const exact = bases.map((b) => (abs * Math.max(0, b)) / total);
  const parts = exact.map((x) => Math.floor(x));
  let leftover = abs - parts.reduce((s, p) => s + p, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), basis: bases[i] }))
    .filter((o) => o.basis > 0)
    .sort((a, b) => b.frac - a.frac || b.basis - a.basis || a.i - b.i);
  for (let k = 0; leftover > 0 && order.length > 0; k = (k + 1) % order.length) {
    parts[order[k].i] += 1;
    leftover -= 1;
  }
  return parts.map((p) => p * sign);
}

/**
 * Whole units of a component a build consumes: quantity per finished unit x
 * build quantity, plus the wastage percentage, rounded up (you can't use part
 * of a unit from stock).
 */
export function componentUnitsNeeded(
  quantityPerUnit: number,
  buildQuantity: number,
  wastagePercent: number
): number {
  const raw = quantityPerUnit * buildQuantity * (1 + (wastagePercent || 0) / 100);
  // Guard against float noise like 6.000000000001 rounding up to 7.
  return Math.ceil(Math.round(raw * 1e6) / 1e6);
}

/**
 * How much of an extra cost (landed cost) belongs on the shelf versus in cost
 * of goods sold. If only part of what was bought is still on hand, only that
 * share is added to the stock's value; the rest was already sold and goes to
 * cost of sales. `receivedUnits` is how many units the cost relates to.
 */
export function splitCostOnHand(
  addedCost: number,
  onHand: number,
  receivedUnits: number
): { capitalized: number; expensed: number } {
  if (addedCost === 0) return { capitalized: 0, expensed: 0 };
  if (onHand <= 0) return { capitalized: 0, expensed: addedCost };
  if (receivedUnits <= 0 || onHand >= receivedUnits) return { capitalized: addedCost, expensed: 0 };
  const capitalized = Math.round((addedCost * onHand) / receivedUnits);
  return { capitalized, expensed: addedCost - capitalized };
}

/** Profit as a share of the selling price, in percent (null with no price). */
export function marginPercent(cost: number, sale: number): number | null {
  if (sale <= 0) return null;
  return ((sale - cost) / sale) * 100;
}

/** Profit as a share of the cost, in percent (null with no cost). */
export function markupPercent(cost: number, sale: number): number | null {
  if (cost <= 0) return null;
  return ((sale - cost) / cost) * 100;
}

/**
 * Per-unit book cost of an item: book value / units on hand, falling back to
 * the stored average cost (and then the purchase price) when nothing is on hand.
 */
export function unitBookCost(item: {
  quantityOnHand: number;
  totalValue: number;
  averageCost: number;
  purchasePrice?: number;
}): number {
  if (item.quantityOnHand > 0) return Math.round(item.totalValue / item.quantityOnHand);
  return item.averageCost || item.purchasePrice || 0;
}

/** Sum quantities per item id (a transfer or build can list one item twice). */
export function totalsByItem<T extends { inventoryItemId: string; quantity: number }>(
  lines: T[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) out.set(l.inventoryItemId, (out.get(l.inventoryItemId) ?? 0) + l.quantity);
  return out;
}
