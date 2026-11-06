import { db } from "@/lib/db";
import {
  procurementSettings,
  goodsReceiptLine,
  goodsReceipt,
} from "@/lib/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";

/**
 * Procurement helpers: per-org three-way-match tolerances + the match engine
 * comparing ordered (PO) vs received (GRN) vs billed quantities and prices.
 *
 * Conventions (matching the rest of the schema):
 *  • quantities are x100 (e.g. 5 units = 500); the same scale on poLine.quantity,
 *    poLine.quantityReceived, poLine.quantityBilled and goodsReceiptLine.quantityReceived.
 *  • monetary amounts are integer cents.
 *  • tolerances are stored in BASIS POINTS (500 = 5%).
 */

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type DbOrTx = typeof db | Tx;

/** Resolved per-org procurement settings (defaults when no row exists). */
export interface ResolvedProcurementSettings {
  priceTolerancePercent: number; // basis points
  qtyTolerancePercent: number; // basis points
  requireGrnBeforeBill: boolean;
  blockOverBill: boolean;
}

export const DEFAULT_PROCUREMENT_SETTINGS: ResolvedProcurementSettings = {
  priceTolerancePercent: 0,
  qtyTolerancePercent: 0,
  requireGrnBeforeBill: false,
  blockOverBill: false,
};

/**
 * Read an org's procurement settings, falling back to safe defaults (no
 * tolerance, nothing blocked) when the org has never configured them.
 */
export async function getProcurementSettings(
  organizationId: string,
  exec: DbOrTx = db
): Promise<ResolvedProcurementSettings> {
  const row = await exec.query.procurementSettings.findFirst({
    where: eq(procurementSettings.organizationId, organizationId),
  });
  if (!row) return { ...DEFAULT_PROCUREMENT_SETTINGS };
  return {
    priceTolerancePercent: row.priceTolerancePercent,
    qtyTolerancePercent: row.qtyTolerancePercent,
    requireGrnBeforeBill: row.requireGrnBeforeBill,
    blockOverBill: row.blockOverBill,
  };
}

/** A single PO line's ordered / received / billed state for matching. */
export interface MatchLineInput {
  purchaseOrderLineId: string;
  description?: string;
  /** Ordered quantity (x100). */
  quantityOrdered: number;
  /** Quantity received so far (x100). */
  quantityReceived: number;
  /** Quantity billed so far, EXCLUDING the proposed bill (x100). */
  quantityBilled: number;
  /** Proposed quantity to bill now (x100). Defaults to 0 (pure status check). */
  quantityToBill?: number;
  /** PO unit price (cents). */
  unitPriceOrdered: number;
  /** Bill unit price for the proposed bill (cents). Defaults to the PO price. */
  unitPriceBilled?: number;
}

export type MatchStatus = "matched" | "warning" | "blocked";

export interface MatchLineResult {
  purchaseOrderLineId: string;
  description?: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityBilled: number; // including the proposed quantityToBill
  quantityToBill: number;
  unitPriceOrdered: number;
  unitPriceBilled: number;
  /** Billed beyond received (x100); >0 means billing un-received goods. */
  overReceivedBy: number;
  /** Billed beyond ordered (x100); >0 means over-billing the PO. */
  overOrderedBy: number;
  /** Price variance in basis points vs the PO unit price (signed). */
  priceVarianceBp: number;
  status: MatchStatus;
  issues: string[];
}

export interface MatchResult {
  status: MatchStatus;
  lines: MatchLineResult[];
  issues: string[];
}

function bpVariance(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 10000;
  return Math.round(((actual - expected) / expected) * 10000);
}

/**
 * Three-way match: compare PO (ordered) vs GRN (received) vs bill (billed) at
 * the line level against the org's tolerances. Pure/synchronous given resolved
 * settings — exported for the AP-BILLS agent to call before posting a bill.
 *
 *   • quantityToBill that pushes cumulative billed beyond RECEIVED is a problem:
 *       — `warning` normally (you can bill ahead of receipt)
 *       — `blocked` when settings.requireGrnBeforeBill OR settings.blockOverBill
 *   • cumulative billed beyond ORDERED (outside the qty tolerance) is over-billing:
 *       — `blocked` when settings.blockOverBill, else `warning`
 *   • bill unit price outside the price tolerance is a price variance `warning`.
 *
 * Overall status is the most severe line status (blocked > warning > matched).
 */
export function threeWayMatch(
  lines: MatchLineInput[],
  settings: ResolvedProcurementSettings
): MatchResult {
  const lineResults: MatchLineResult[] = lines.map((l) => {
    const quantityToBill = l.quantityToBill ?? 0;
    const unitPriceBilled = l.unitPriceBilled ?? l.unitPriceOrdered;
    const cumulativeBilled = l.quantityBilled + quantityToBill;

    const overReceivedBy = cumulativeBilled - l.quantityReceived;
    const overOrderedBy = cumulativeBilled - l.quantityOrdered;
    const priceVarianceBp = bpVariance(unitPriceBilled, l.unitPriceOrdered);

    const issues: string[] = [];
    let status: MatchStatus = "matched";
    const escalate = (s: MatchStatus) => {
      if (s === "blocked") status = "blocked";
      else if (s === "warning" && status !== "blocked") status = "warning";
    };

    // Quantity vs received.
    if (overReceivedBy > 0) {
      if (settings.requireGrnBeforeBill || settings.blockOverBill) {
        issues.push(
          `Billing ${overReceivedBy / 100} more than received (received ${l.quantityReceived / 100}, billed ${cumulativeBilled / 100})`
        );
        escalate("blocked");
      } else {
        issues.push(
          `Billing ${overReceivedBy / 100} ahead of receipt (received ${l.quantityReceived / 100})`
        );
        escalate("warning");
      }
    }

    // Quantity vs ordered (apply qty tolerance on the ordered quantity).
    const qtyToleranceUnits = Math.round((l.quantityOrdered * settings.qtyTolerancePercent) / 10000);
    if (overOrderedBy > qtyToleranceUnits) {
      issues.push(
        `Over-billing the PO by ${overOrderedBy / 100} (ordered ${l.quantityOrdered / 100}, billed ${cumulativeBilled / 100})`
      );
      escalate(settings.blockOverBill ? "blocked" : "warning");
    }

    // Price variance.
    if (Math.abs(priceVarianceBp) > settings.priceTolerancePercent) {
      issues.push(
        `Price variance ${(priceVarianceBp / 100).toFixed(2)}% (PO ${l.unitPriceOrdered}, bill ${unitPriceBilled})`
      );
      escalate("warning");
    }

    return {
      purchaseOrderLineId: l.purchaseOrderLineId,
      description: l.description,
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived,
      quantityBilled: cumulativeBilled,
      quantityToBill,
      unitPriceOrdered: l.unitPriceOrdered,
      unitPriceBilled,
      overReceivedBy,
      overOrderedBy,
      priceVarianceBp,
      status,
      issues,
    };
  });

  const overall: MatchStatus = lineResults.some((l) => l.status === "blocked")
    ? "blocked"
    : lineResults.some((l) => l.status === "warning")
    ? "warning"
    : "matched";

  return {
    status: overall,
    lines: lineResults,
    issues: lineResults.flatMap((l) => l.issues),
  };
}

/**
 * Given a PO's lines and what is being billed now, derive the resulting PO
 * status purely from remaining quantity-to-bill:
 *   • nothing billed yet  → keep the PO's pre-bill flow status ("sent")
 *   • some but not all billed → "partial"
 *   • everything billed   → "closed"
 * (Receipt status is tracked separately via "received"; billing fully closes a PO.)
 */
export function derivePurchaseOrderStatusAfterBilling(
  lines: { quantity: number; quantityBilled: number }[]
): "sent" | "partial" | "closed" {
  const totalOrdered = lines.reduce((s, l) => s + l.quantity, 0);
  const totalBilled = lines.reduce((s, l) => s + l.quantityBilled, 0);
  if (totalBilled <= 0) return "sent";
  if (totalBilled >= totalOrdered) return "closed";
  return "partial";
}

/**
 * Derive the PO status after a goods receipt, from cumulative received qty:
 *   • nothing received → "sent"
 *   • some but not all → "partial"
 *   • all received     → "received"
 */
export function derivePurchaseOrderStatusAfterReceipt(
  lines: { quantity: number; quantityReceived: number }[]
): "sent" | "partial" | "received" {
  const totalOrdered = lines.reduce((s, l) => s + l.quantity, 0);
  const totalReceived = lines.reduce((s, l) => s + l.quantityReceived, 0);
  if (totalReceived <= 0) return "sent";
  if (totalReceived >= totalOrdered) return "received";
  return "partial";
}

/**
 * A purchase order's status from BOTH what has arrived and what has been
 * billed (quantities x100), so receiving and billing never overwrite each
 * other's progress:
 *   • every line fully billed            → "closed" (Fully billed)
 *   • every line fully received          → "received" (All items in)
 *   • anything received or billed so far → "partial"
 *   • nothing yet                        → "sent"
 */
export function derivePurchaseOrderStatus(
  lines: { quantity: number; quantityReceived: number; quantityBilled: number }[]
): "sent" | "partial" | "received" | "closed" {
  const open = lines.filter((l) => l.quantity > 0);
  if (open.length === 0) return "sent";
  if (open.every((l) => l.quantityBilled >= l.quantity)) return "closed";
  if (open.every((l) => l.quantityReceived >= l.quantity)) return "received";
  if (open.some((l) => l.quantityReceived > 0 || l.quantityBilled > 0)) return "partial";
  return "sent";
}

/**
 * Match a bill's lines to a purchase order's lines for billing, without a
 * stored link: a line tied to a goods receipt goes to that receipt's PO line,
 * then the same stock item, then the same description. Each PO line takes at
 * most what's still unbilled. Returns PO line id → quantity (x100) billed now.
 */
export function allocateBillToPurchaseOrderLines(
  billLines: { quantity: number; description: string; inventoryItemId?: string | null; purchaseOrderLineId?: string | null }[],
  poLines: { id: string; quantity: number; quantityBilled: number; description: string; inventoryItemId?: string | null }[]
): Map<string, number> {
  const remaining = new Map(poLines.map((l) => [l.id, Math.max(0, l.quantity - l.quantityBilled)]));
  const out = new Map<string, number>();
  const take = (poLineId: string, qty: number) => {
    const room = remaining.get(poLineId) ?? 0;
    const q = Math.min(room, qty);
    if (q <= 0) return qty;
    remaining.set(poLineId, room - q);
    out.set(poLineId, (out.get(poLineId) ?? 0) + q);
    return qty - q;
  };
  for (const bl of billLines) {
    let left = bl.quantity;
    if (left <= 0) continue;
    if (bl.purchaseOrderLineId && remaining.has(bl.purchaseOrderLineId)) left = take(bl.purchaseOrderLineId, left);
    const desc = bl.description.trim().toLowerCase();
    for (const pl of poLines) {
      if (left <= 0) break;
      if (bl.inventoryItemId && pl.inventoryItemId === bl.inventoryItemId) left = take(pl.id, left);
    }
    for (const pl of poLines) {
      if (left <= 0) break;
      if (pl.description.trim().toLowerCase() === desc) left = take(pl.id, left);
    }
  }
  return out;
}

/**
 * Entries a void still has to reverse: each candidate once (a bill's GRNI entry
 * can be found both by its sourceId and through goods receipt lines), minus
 * any entry that already has a reversal.
 */
export function entriesStillToReverse<T extends { id: string }>(
  candidates: T[],
  alreadyReversedIds: (string | null)[]
): T[] {
  const reversed = new Set(alreadyReversedIds.filter((v): v is string => !!v));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of candidates) {
    if (seen.has(c.id) || reversed.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Billed quantity left on each PO line after releasing what one bill counted
 * (all x100). Several records for the same line add up, and a line never drops
 * below zero. Returns PO line id → new quantityBilled, only for lines touched.
 */
export function releaseBilledQuantities(
  poLines: { id: string; quantityBilled: number }[],
  counted: { purchaseOrderLineId: string; quantity: number }[]
): Map<string, number> {
  const release = new Map<string, number>();
  for (const c of counted) {
    if (c.quantity <= 0) continue;
    release.set(c.purchaseOrderLineId, (release.get(c.purchaseOrderLineId) ?? 0) + c.quantity);
  }
  const out = new Map<string, number>();
  for (const l of poLines) {
    const r = release.get(l.id);
    if (r === undefined) continue;
    out.set(l.id, Math.max(0, l.quantityBilled - r));
  }
  return out;
}

/**
 * One slice of a converted PO line's billed quantity, split by whether it can be
 * MATCHED to a goods receipt (stock already brought on-hand → bill clears GRNI)
 * or is UNMATCHED (not yet received → bill capitalises fresh stock).
 */
export interface ConvertLineAllocation {
  /** GRN line to link this slice to; null for the un-received (unmatched) slice. */
  goodsReceiptLineId: string | null;
  /** Quantity in this slice (x100). */
  quantityX100: number;
}

/**
 * For each PO line being converted to a bill, split the quantity-to-bill into a
 * GRN-matched portion (already goods-received, so the bill must CLEAR GRNI
 * instead of re-capitalising stock — fixes the GRN-then-convert double-count)
 * and an un-received remainder (capitalised fresh as before).
 *
 * Matchable quantity per PO line = received-but-not-yet-billed, i.e.
 *   max(0, min(quantityReceived, quantity) − quantityBilled),
 * allocated across that line's goods-receipt lines (oldest first), each capped at
 * the GRN line's own received quantity. GRN lines are org-scoped via the parent
 * goodsReceipt so a caller cannot reach another org's receipts.
 *
 * @param poLines the PO lines being billed, with current received/billed tallies
 *   and the quantity-to-bill now (all x100).
 * Returns a map: poLineId → ordered slices (matched first, then the remainder).
 * Quantities are x100. Only PO lines with goods received appear with a matched
 * slice; lines with no receipt return a single unmatched slice for the full qty.
 */
export async function resolveConvertLineAllocations(
  organizationId: string,
  poLines: {
    purchaseOrderLineId: string;
    quantity: number; // ordered x100
    quantityReceived: number; // x100
    quantityBilled: number; // x100 (before this conversion)
    quantityToBill: number; // x100
  }[],
  exec: DbOrTx = db
): Promise<Map<string, ConvertLineAllocation[]>> {
  const result = new Map<string, ConvertLineAllocation[]>();
  const poLineIds = poLines.map((p) => p.purchaseOrderLineId);

  // Org-scoped GRN lines for these PO lines, oldest-first for stable allocation.
  const grnLines = poLineIds.length
    ? (
        await exec
          .select({ line: goodsReceiptLine })
          .from(goodsReceiptLine)
          .innerJoin(goodsReceipt, eq(goodsReceiptLine.goodsReceiptId, goodsReceipt.id))
          .where(
            and(
              inArray(goodsReceiptLine.purchaseOrderLineId, poLineIds),
              eq(goodsReceipt.organizationId, organizationId)
            )
          )
          .orderBy(asc(goodsReceiptLine.sortOrder))
      ).map((r) => r.line)
    : [];

  const grnByPoLine = new Map<string, typeof grnLines>();
  for (const g of grnLines) {
    if (!g.purchaseOrderLineId) continue;
    const list = grnByPoLine.get(g.purchaseOrderLineId) ?? [];
    list.push(g);
    grnByPoLine.set(g.purchaseOrderLineId, list);
  }

  for (const po of poLines) {
    const slices: ConvertLineAllocation[] = [];
    let remainingToBill = po.quantityToBill;
    if (remainingToBill <= 0) {
      result.set(po.purchaseOrderLineId, slices);
      continue;
    }

    // Received-but-not-yet-billed quantity is what can clear GRNI on this bill.
    let matchable = Math.max(
      0,
      Math.min(po.quantityReceived, po.quantity) - po.quantityBilled
    );

    const grns = grnByPoLine.get(po.purchaseOrderLineId) ?? [];
    for (const g of grns) {
      if (remainingToBill <= 0 || matchable <= 0) break;
      const fromThisGrn = Math.min(g.quantityReceived, matchable, remainingToBill);
      if (fromThisGrn <= 0) continue;
      slices.push({ goodsReceiptLineId: g.id, quantityX100: fromThisGrn });
      remainingToBill -= fromThisGrn;
      matchable -= fromThisGrn;
    }

    // Any quantity beyond what was received is capitalised fresh (unmatched).
    if (remainingToBill > 0) {
      slices.push({ goodsReceiptLineId: null, quantityX100: remainingToBill });
    }

    result.set(po.purchaseOrderLineId, slices);
  }

  return result;
}
