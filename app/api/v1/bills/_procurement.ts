/**
 * Shared procurement posting + three-way-match logic for bill posting
 * (receive / approve). Inlined here (not in lib/api/procurement.ts, which is
 * owned by the PO/GRN agent) so this module is self-contained.
 *
 * When a bill line links to a goods-receipt line and/or a purchase-order line,
 * the goods have ALREADY been brought on-hand at receipt time (DR Inventory /
 * CR GRNI). So at bill time we must NOT re-capitalise or re-receive that stock.
 *
 * POSTING MODEL (matched lines):
 *   The caller passes ONLY the unmatched lines to createBillJournalEntry, so the
 *   main bill entry credits AP for (unmatched debits + full tax). The matched
 *   lines are posted by a separate, self-balancing GRNI-clearing entry that
 *   credits AP for the matched lines' billed value:
 *     DR GRNI (2150)  received value (qtyBilled x receivedUnitCost) — clears accrual
 *     DR PPV  (5050)  when billed > received (unfavourable variance)
 *     CR PPV  (5050)  when billed < received (favourable variance)
 *     CR AP   (2100)  matched billed value
 *   received + variance === billed, so DR(GRNI)+DR/CR(PPV) === CR(AP) and the
 *   entry balances. Across both entries AP is credited for the full bill total.
 *
 * SIDE EFFECTS: revalue on-hand inventory by the variance (so Inventory book
 * value reflects what was actually paid), increment purchaseOrderLine.quantityBilled,
 * mark the goods-receipt header billed, and stamp the GRN line with the entry.
 *
 * THREE-WAY MATCH: enforce procurementSettings tolerances (over-bill qty,
 * out-of-tolerance price) and requireGrnBeforeBill — warnings by default, hard
 * 422 block when blockOverBill / requireGrnBeforeBill is on.
 *
 * All amounts are integer cents; quantities are x100 (document scale).
 */
import { db } from "@/lib/db";
import {
  journalEntry,
  journalLine,
  goodsReceiptLine,
  goodsReceipt,
  purchaseOrder,
  purchaseOrderLine,
  inventoryItem,
  inventoryMovement,
  billPurchaseOrder,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  getNextEntryNumber,
  ensureControlAccount,
  findAccountByCode,
  resolveBaseRate,
  toBaseLines,
} from "@/lib/api/journal-automation";
// Reuse the shared three-way-match engine + settings reader from the
// procurement helper (owned by the PO/GRN agent) so tolerance semantics stay
// consistent across the codebase.
import {
  getProcurementSettings,
  threeWayMatch,
  type MatchLineInput,
} from "@/lib/api/procurement";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type DbOrTx = typeof db | Tx;

interface ProcurementContext {
  organizationId: string;
  userId: string;
}

/** A bill line as loaded from the DB, with the fields procurement cares about. */
export interface BillLineForProcurement {
  id: string;
  description: string;
  amount: number; // net line amount (cents)
  quantity: number; // x100
  accountId: string | null;
  inventoryItemId: string | null;
  warehouseId: string | null;
  goodsReceiptLineId: string | null;
  // Per-line tax, threaded into createBillJournalEntry so input VAT is actually
  // recognised (recoverable → 1500, blocked → cost, reverse_charge → dual legs).
  taxRateId?: string | null;
  taxAmount?: number;
}

/**
 * A line matched to a receipt/PO (clears GRNI rather than capitalising fresh
 * stock), resolved with the received cost basis it clears.
 */
export interface MatchedLine {
  billLine: BillLineForProcurement;
  goodsReceiptLineId: string | null;
  purchaseOrderLineId: string | null;
  inventoryItemId: string | null;
  warehouseId: string | null;
  /** Quantity being billed on this line, x100. */
  quantityBilledX100: number;
  /** Quantity received on the matched GRN line, x100 (caps GRNI clearing). */
  quantityReceivedX100: number;
  /** Unit cost recorded at receipt time (cents). */
  receivedUnitCost: number;
  /** Unit cost on the bill line (cents). */
  billedUnitCost: number;
}

export interface ProcurementResolution {
  /** Lines that clear GRNI (linked to a GRN line). */
  matched: MatchedLine[];
  /** Bill lines NOT linked to a receipt/PO — caller handles these as before. */
  unmatched: BillLineForProcurement[];
}

/** Validation issue surfaced to the caller (warn) or thrown (block). */
export interface ToleranceIssue {
  billLineId: string;
  kind: "over_bill_qty" | "price_out_of_tolerance" | "grn_required";
  message: string;
}

/**
 * Thrown when a hard procurement control (blockOverBill / requireGrnBeforeBill)
 * is violated. Surfaced as HTTP 422 by the route.
 */
export class ProcurementBlockedError extends Error {
  issues: ToleranceIssue[];
  constructor(issues: ToleranceIssue[]) {
    super(issues.map((i) => i.message).join("; ") || "Procurement check failed");
    this.name = "ProcurementBlockedError";
    this.issues = issues;
  }
}

/** Net unit cost (cents) for a line: amount / units. 0 when no units. */
function unitCostOf(amount: number, quantityX100: number): number {
  const units = Math.round(quantityX100 / 100);
  if (units <= 0) return 0;
  return Math.round(amount / units);
}

/**
 * Resolve which bill lines are matched to a goods-receipt line. A line is
 * "matched" (clears GRNI) when it carries a goodsReceiptLineId that resolves to
 * a goods-receipt line for this org.
 */
export async function resolveProcurementLines(
  ctx: ProcurementContext,
  lines: BillLineForProcurement[],
  exec: DbOrTx = db
): Promise<ProcurementResolution> {
  const matched: MatchedLine[] = [];
  const unmatched: BillLineForProcurement[] = [];

  const grnLineIds = lines
    .map((l) => l.goodsReceiptLineId)
    .filter((v): v is string => !!v);
  // Org-scope: join through goodsReceipt (which carries organizationId) so a
  // caller cannot reference another org's GRN line by id. Lines whose GRN line
  // resolves to a different org simply fall through to `unmatched`.
  const grnLines = grnLineIds.length
    ? await exec
        .select({ line: goodsReceiptLine })
        .from(goodsReceiptLine)
        .innerJoin(goodsReceipt, eq(goodsReceiptLine.goodsReceiptId, goodsReceipt.id))
        .where(
          and(
            inArray(goodsReceiptLine.id, grnLineIds),
            eq(goodsReceipt.organizationId, ctx.organizationId)
          )
        )
    : [];
  const grnLineById = new Map(grnLines.map((g) => [g.line.id, g.line]));

  for (const line of lines) {
    if (line.goodsReceiptLineId) {
      const grn = grnLineById.get(line.goodsReceiptLineId);
      if (grn) {
        const receivedUnitCost =
          grn.unitCost || unitCostOf(line.amount, line.quantity);
        matched.push({
          billLine: line,
          goodsReceiptLineId: grn.id,
          purchaseOrderLineId: grn.purchaseOrderLineId ?? null,
          inventoryItemId: line.inventoryItemId ?? grn.inventoryItemId ?? null,
          warehouseId: line.warehouseId ?? grn.warehouseId ?? null,
          quantityBilledX100: line.quantity,
          quantityReceivedX100: grn.quantityReceived,
          receivedUnitCost,
          billedUnitCost: unitCostOf(line.amount, line.quantity),
        });
        continue;
      }
    }
    unmatched.push(line);
  }

  return { matched, unmatched };
}

/**
 * Enforce three-way-match tolerances + controls for the resolution. Returns
 * soft warnings; throws ProcurementBlockedError for hard violations
 * (blockOverBill on an over-bill / out-of-tolerance price, or
 * requireGrnBeforeBill on an unmatched stock line).
 */
export async function checkProcurementTolerances(
  ctx: ProcurementContext,
  resolution: ProcurementResolution,
  exec: DbOrTx = db
): Promise<{ warnings: ToleranceIssue[] }> {
  const settings = await getProcurementSettings(ctx.organizationId, exec);
  const warnings: ToleranceIssue[] = [];
  const blocking: ToleranceIssue[] = [];

  // requireGrnBeforeBill: any unmatched stock line is a hard violation.
  if (settings.requireGrnBeforeBill) {
    for (const l of resolution.unmatched) {
      if (l.inventoryItemId) {
        blocking.push({
          billLineId: l.id,
          kind: "grn_required",
          message: `Line "${l.description}" requires a goods receipt before it can be billed`,
        });
      }
    }
  }

  // PO-linked lines go through the shared three-way-match engine so qty/price
  // tolerance semantics stay consistent with the rest of procurement.
  const poLineIds = resolution.matched
    .map((m) => m.purchaseOrderLineId)
    .filter((v): v is string => !!v);
  // Org-scope: join through purchaseOrder (which carries organizationId) so a
  // caller cannot read another org's PO line by id.
  const poLines = poLineIds.length
    ? (
        await exec
          .select({ line: purchaseOrderLine })
          .from(purchaseOrderLine)
          .innerJoin(purchaseOrder, eq(purchaseOrderLine.purchaseOrderId, purchaseOrder.id))
          .where(
            and(
              inArray(purchaseOrderLine.id, poLineIds),
              eq(purchaseOrder.organizationId, ctx.organizationId)
            )
          )
      ).map((r) => r.line)
    : [];
  const poLineById = new Map(poLines.map((p) => [p.id, p]));

  // Map matched-with-PO lines to MatchLineInput, keyed back to the bill line.
  const matchInputs: (MatchLineInput & { billLineId: string; description: string })[] = [];
  for (const m of resolution.matched) {
    if (!m.purchaseOrderLineId) continue;
    const po = poLineById.get(m.purchaseOrderLineId);
    if (!po) continue;
    matchInputs.push({
      purchaseOrderLineId: m.purchaseOrderLineId,
      description: m.billLine.description,
      billLineId: m.billLine.id,
      quantityOrdered: po.quantity,
      quantityReceived: po.quantityReceived,
      quantityBilled: po.quantityBilled,
      quantityToBill: m.quantityBilledX100,
      unitPriceOrdered: po.unitPrice,
      unitPriceBilled: m.billedUnitCost,
    });
  }

  if (matchInputs.length > 0) {
    const result = threeWayMatch(matchInputs, settings);
    for (const line of result.lines) {
      const src = matchInputs.find((mi) => mi.purchaseOrderLineId === line.purchaseOrderLineId);
      if (!src || line.status === "matched" || line.issues.length === 0) continue;
      const kind: ToleranceIssue["kind"] =
        line.overOrderedBy > 0 || line.overReceivedBy > 0
          ? "over_bill_qty"
          : "price_out_of_tolerance";
      const issue: ToleranceIssue = {
        billLineId: src.billLineId,
        kind,
        message: `Line "${src.description}": ${line.issues.join("; ")}`,
      };
      if (line.status === "blocked") blocking.push(issue);
      else warnings.push(issue);
    }
  }

  // GRN-only lines (no PO link) aren't covered by threeWayMatch — check the
  // billed-vs-received price variance directly against the price tolerance.
  for (const m of resolution.matched) {
    if (m.purchaseOrderLineId) continue;
    if (m.receivedUnitCost <= 0) continue;
    const varianceBp = Math.round(
      (Math.abs(m.billedUnitCost - m.receivedUnitCost) / m.receivedUnitCost) * 10000
    );
    if (varianceBp > settings.priceTolerancePercent) {
      const issue: ToleranceIssue = {
        billLineId: m.billLine.id,
        kind: "price_out_of_tolerance",
        message: `Line "${m.billLine.description}" billed unit cost ${
          m.billedUnitCost / 100
        } differs from received ${m.receivedUnitCost / 100} beyond tolerance`,
      };
      if (settings.blockOverBill) blocking.push(issue);
      else warnings.push(issue);
    }
  }

  if (blocking.length > 0) throw new ProcurementBlockedError(blocking);
  return { warnings };
}

/**
 * Per-line inventory revaluation decision, produced by postGrniClearingEntry so
 * applyProcurementSideEffects revalues on-hand stock by EXACTLY the amount that
 * was debited to Inventory in the GL (never off-book / double-counted).
 */
export interface InventoryRevaluation {
  inventoryItemId: string;
  warehouseId: string | null;
  /** Amount debited to Inventory in the clearing entry (signed cents). */
  absorbedVariance: number;
  /** Item on-hand at posting time (units) — for the movement audit row. */
  quantityOnHand: number;
}

/**
 * Post the self-balancing GRNI-clearing + PPV (+ inventory revaluation) journal
 * entry for matched lines, inside the caller's transaction. Per matched line:
 *
 *   clearedUnits = min(received, billed)         GRNI only ever accrued the received qty
 *   DR GRNI   receivedUnitCost * clearedUnits    clears the accrual at received cost
 *   DR Inv    (billed − received) * absorbable   revalue on-hand stock (cleared portion)
 *   DR/CR PPV remainder                          price var not absorbed + over-billed (un-received) cost
 *   CR AP     billLine.amount                    full net line value (AP totals the bill)
 *
 * GRNI is cleared at min(received, billed) so partial billing neither strands
 * nor over-clears the accrual. The over-billed (not-yet-received) portion has no
 * GRNI to clear and no stock to capitalise, so its full cost lands in PPV. The
 * cleared-portion price variance is absorbed into Inventory for units still on
 * hand and posted to PPV for the rest (e.g. on-hand depleted → full to PPV).
 * DR(GRNI)+DR(Inv)+DR/CR(PPV) === CR(AP), so the entry balances.
 *
 * Returns the entry id (null when no matched lines / no legs) and the inventory
 * revaluations applied, for applyProcurementSideEffects.
 */
export async function postGrniClearingEntry(
  ctx: ProcurementContext,
  data: {
    billNumber: string;
    date: string;
    currencyCode?: string;
    matched: MatchedLine[];
  },
  tx: Tx
): Promise<{ entryId: string | null; revaluations: InventoryRevaluation[] }> {
  if (data.matched.length === 0) return { entryId: null, revaluations: [] };

  const { base, currency, rate } = await resolveBaseRate(
    ctx.organizationId,
    data.currencyCode,
    data.date
  );

  const grniAcct = await ensureControlAccount(ctx.organizationId, "grni", base, tx);
  const ppvAcct = await ensureControlAccount(ctx.organizationId, "purchasePriceVariance", base, tx);
  const apAcct = await findAccountByCode(ctx.organizationId, "2100", tx);
  if (!grniAcct || !ppvAcct || !apAcct) return { entryId: null, revaluations: [] };

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: `Bill ${data.billNumber} — GRNI clearing`,
      reference: data.billNumber,
      status: "posted",
      sourceType: "bill_grni",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];
  const revaluations: InventoryRevaluation[] = [];
  let totalBilled = 0;

  for (const m of data.matched) {
    const billedUnits = Math.round(m.quantityBilledX100 / 100);
    const receivedUnits = Math.round(m.quantityReceivedX100 / 100);
    // GRNI only accrued the received qty; clear at min(received, billed).
    const clearedUnits = Math.min(receivedUnits, billedUnits);
    const grniValue = m.receivedUnitCost * clearedUnits;
    const billedValue = m.billLine.amount; // net line amount → always credited to AP
    totalBilled += billedValue;

    // DR GRNI to clear the accrued liability at received cost for the cleared qty.
    if (grniValue !== 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: grniAcct.id,
        description: `Clear GRNI ${m.billLine.description}`,
        debitAmount: grniValue > 0 ? grniValue : 0,
        creditAmount: grniValue < 0 ? -grniValue : 0,
      });
    }

    // Split the remainder (billedValue − grniValue) into an Inventory revaluation
    // (price variance on units still on hand) and PPV (everything else).
    let inventoryAbsorbed = 0;
    if (m.inventoryItemId && clearedUnits > 0) {
      const item = await tx.query.inventoryItem.findFirst({
        where: and(
          eq(inventoryItem.id, m.inventoryItemId),
          eq(inventoryItem.organizationId, ctx.organizationId)
        ),
      });
      if (item) {
        // Cleared-portion price variance, capped at units actually still on hand
        // (can't revalue stock that has already been consumed).
        const absorbableUnits = Math.min(clearedUnits, Math.max(0, item.quantityOnHand));
        inventoryAbsorbed = (m.billedUnitCost - m.receivedUnitCost) * absorbableUnits;
        if (inventoryAbsorbed !== 0) {
          const invAcct =
            (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
            (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
          if (invAcct) {
            lines.push({
              journalEntryId: entry.id,
              accountId: invAcct.id,
              description: `Inventory revaluation ${m.billLine.description}`,
              debitAmount: inventoryAbsorbed > 0 ? inventoryAbsorbed : 0,
              creditAmount: inventoryAbsorbed < 0 ? -inventoryAbsorbed : 0,
            });
            revaluations.push({
              inventoryItemId: m.inventoryItemId,
              warehouseId: m.warehouseId ?? null,
              absorbedVariance: inventoryAbsorbed,
              quantityOnHand: item.quantityOnHand,
            });
          } else {
            inventoryAbsorbed = 0; // couldn't resolve an account → fall to PPV
          }
        }
      }
    }

    // Purchase price variance = remainder not cleared to GRNI and not absorbed
    // into inventory. Covers the cleared-portion variance on depleted stock AND
    // the full cost of any over-billed (not-yet-received) units. DR unfavourable,
    // CR favourable.
    const ppv = billedValue - grniValue - inventoryAbsorbed;
    if (ppv !== 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: ppvAcct.id,
        description: `Purchase price variance ${m.billLine.description}`,
        debitAmount: ppv > 0 ? ppv : 0,
        creditAmount: ppv < 0 ? -ppv : 0,
      });
    }
  }

  // CR Accounts Payable for the matched lines' billed value, so this entry
  // balances (DR GRNI + DR Inv + DR/CR PPV === CR AP) and AP across both entries
  // equals the full bill total.
  if (totalBilled !== 0) {
    lines.push({
      journalEntryId: entry.id,
      accountId: apAcct.id,
      description: `Bill ${data.billNumber}`,
      debitAmount: totalBilled < 0 ? -totalBilled : 0,
      creditAmount: totalBilled > 0 ? totalBilled : 0,
    });
  }

  if (lines.length === 0) {
    await tx.delete(journalEntry).where(eq(journalEntry.id, entry.id));
    return { entryId: null, revaluations: [] };
  }

  await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));
  return { entryId: entry.id, revaluations };
}

/**
 * Side effects after posting: revalue on-hand inventory by the amount actually
 * DEBITED to Inventory in the clearing entry (so book value never diverges from
 * the GL), increment purchaseOrderLine.quantityBilled, mark goods-receipt
 * headers billed, and stamp goods-receipt lines with the clearing entry. Runs
 * inside the caller's transaction.
 */
export async function applyProcurementSideEffects(
  ctx: ProcurementContext,
  matched: MatchedLine[],
  grniEntryId: string | null,
  revaluations: InventoryRevaluation[],
  tx: Tx
): Promise<void> {
  // Apply inventory revaluations decided (and posted to the GL) by
  // postGrniClearingEntry — book value moves by exactly the GL Inventory debit.
  for (const rv of revaluations) {
    if (rv.absorbedVariance === 0) continue;
    const item = await tx.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, rv.inventoryItemId),
        eq(inventoryItem.organizationId, ctx.organizationId)
      ),
    });
    if (!item || item.quantityOnHand <= 0) continue;
    const newValue = item.totalValue + rv.absorbedVariance;
    const newAvg = Math.round(newValue / item.quantityOnHand);
    await tx
      .update(inventoryItem)
      .set({ totalValue: newValue, averageCost: newAvg, updatedAt: new Date() })
      .where(eq(inventoryItem.id, rv.inventoryItemId));
    await tx.insert(inventoryMovement).values({
      organizationId: ctx.organizationId,
      inventoryItemId: rv.inventoryItemId,
      warehouseId: rv.warehouseId,
      type: "adjustment",
      quantity: 0,
      previousQuantity: item.quantityOnHand,
      newQuantity: item.quantityOnHand,
      unitCost: 0,
      value: rv.absorbedVariance,
      referenceType: "purchase_price_variance",
      referenceId: null,
      journalEntryId: grniEntryId,
      createdBy: ctx.userId,
    });
  }

  for (const m of matched) {
    // Increment PO line billed tally for three-way match. Org-scope the read by
    // joining through purchaseOrder so a foreign PO line cannot be touched.
    if (m.purchaseOrderLineId) {
      const [po] = await tx
        .select({ line: purchaseOrderLine })
        .from(purchaseOrderLine)
        .innerJoin(purchaseOrder, eq(purchaseOrderLine.purchaseOrderId, purchaseOrder.id))
        .where(
          and(
            eq(purchaseOrderLine.id, m.purchaseOrderLineId),
            eq(purchaseOrder.organizationId, ctx.organizationId)
          )
        );
      if (po) {
        await tx
          .update(purchaseOrderLine)
          .set({ quantityBilled: po.line.quantityBilled + m.quantityBilledX100 })
          .where(eq(purchaseOrderLine.id, m.purchaseOrderLineId));
      }
    }

    // Stamp the GRN line with the clearing entry and mark the receipt billed.
    if (m.goodsReceiptLineId) {
      await tx
        .update(goodsReceiptLine)
        .set({ journalEntryId: grniEntryId })
        .where(eq(goodsReceiptLine.id, m.goodsReceiptLineId));
      const grnLine = await tx.query.goodsReceiptLine.findFirst({
        where: eq(goodsReceiptLine.id, m.goodsReceiptLineId),
      });
      if (grnLine) {
        await tx
          .update(goodsReceipt)
          .set({ status: "billed", updatedAt: new Date() })
          .where(
            and(
              eq(goodsReceipt.id, grnLine.goodsReceiptId),
              eq(goodsReceipt.organizationId, ctx.organizationId)
            )
          );
      }
    }
  }
}

/**
 * Full bill posting on receive/approve, shared by both routes. In one
 * transaction:
 *   1. resolve matched (GRNI/PO) vs unmatched lines
 *   2. enforce three-way-match tolerances (throws ProcurementBlockedError on a
 *      hard violation — surfaced as 422)
 *   3. post the main bill entry (createBillJournalEntry) over the UNMATCHED line
 *      debits + the FULL bill tax, crediting AP for that slice
 *   4. perpetual-receive the UNMATCHED stock lines (recordBillStockReceipts)
 *   5. post the GRNI-clearing + PPV entry for matched lines (credits AP for the
 *      matched billed value) and apply its side effects (inventory revaluation,
 *      PO quantityBilled, GRN billed status)
 *
 * Returns the main bill journal entry (for stamping bill.journalEntryId) plus
 * the GRNI entry id and any soft tolerance warnings.
 */
export async function postBillReceipt(
  ctx: ProcurementContext,
  bill: {
    billNumber: string;
    issueDate: string;
    currencyCode?: string;
    taxTotal: number;
    total: number;
    lines: BillLineForProcurement[];
  },
  helpers: {
    createBillJournalEntry: (
      ctx: ProcurementContext,
      data: {
        billNumber: string;
        total: number;
        taxTotal: number;
        lines: {
          accountId: string | null;
          amount: number;
          taxAmount: number;
          taxRateId?: string | null;
        }[];
        date: string;
        currencyCode?: string;
      }
    ) => Promise<{ id: string } | null>;
    mapBillLinesForPosting: (
      organizationId: string,
      lines: {
        accountId: string | null;
        amount: number;
        taxAmount: number;
        taxRateId?: string | null;
        inventoryItemId?: string | null;
      }[]
    ) => Promise<
      {
        accountId: string | null;
        amount: number;
        taxAmount: number;
        taxRateId?: string | null;
      }[]
    >;
    recordBillStockReceipts: (
      ctx: ProcurementContext,
      lines: {
        inventoryItemId?: string | null;
        amount: number;
        quantity: number;
        warehouseId?: string | null;
      }[],
      tx: Tx
    ) => Promise<void>;
  }
): Promise<{
  entryId: string | null;
  grniEntryId: string | null;
  warnings: ToleranceIssue[];
}> {
  const resolution = await resolveProcurementLines(ctx, bill.lines);
  // Three-way-match controls (may throw ProcurementBlockedError → 422).
  const { warnings } = await checkProcurementTolerances(ctx, resolution);

  // Main bill entry covers only the unmatched line debits, but the FULL bill tax
  // (so input VAT on matched stock lines is still recognised and AP balances).
  // Each unmatched line carries its OWN taxRateId + taxAmount so the per-line
  // recoverable/blocked/reverse-charge split runs (createBillJournalEntry);
  // the remaining tax (taxTotal − sum of per-line tax handled, i.e. the
  // matched lines' tax) is posted in bulk to Input VAT 1500 as before.
  const unmatchedForPosting = await helpers.mapBillLinesForPosting(
    ctx.organizationId,
    resolution.unmatched.map((l) => ({
      accountId: l.accountId,
      amount: l.amount,
      taxAmount: l.taxAmount ?? 0,
      taxRateId: l.taxRateId ?? null,
      inventoryItemId: l.inventoryItemId,
    }))
  );

  const entry = await helpers.createBillJournalEntry(ctx, {
    billNumber: bill.billNumber,
    total: bill.total,
    taxTotal: bill.taxTotal,
    lines: unmatchedForPosting,
    date: bill.issueDate,
    currencyCode: bill.currencyCode,
  });

  let grniEntryId: string | null = null;
  await db.transaction(async (tx) => {
    // Perpetual receipt for UNMATCHED stock lines only (matched stock was
    // already brought on-hand at GRN time — see postGrniClearingEntry).
    const unmatchedStock = resolution.unmatched.filter((l) => l.inventoryItemId);
    if (unmatchedStock.length > 0) {
      await helpers.recordBillStockReceipts(
        ctx,
        unmatchedStock.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          amount: l.amount,
          quantity: l.quantity,
          warehouseId: l.warehouseId,
        })),
        tx
      );
    }

    if (resolution.matched.length > 0) {
      const posted = await postGrniClearingEntry(
        ctx,
        {
          billNumber: bill.billNumber,
          date: bill.issueDate,
          currencyCode: bill.currencyCode,
          matched: resolution.matched,
        },
        tx
      );
      grniEntryId = posted.entryId;
      await applyProcurementSideEffects(
        ctx,
        resolution.matched,
        grniEntryId,
        posted.revaluations,
        tx
      );
    }
  });

  return { entryId: entry?.id ?? null, grniEntryId, warnings };
}

/** Link a bill to one or more purchase orders via the join table (idempotent). */
export async function linkBillToPurchaseOrders(
  billId: string,
  purchaseOrderIds: string[],
  tx: DbOrTx = db
): Promise<void> {
  const unique = Array.from(new Set(purchaseOrderIds.filter(Boolean)));
  if (unique.length === 0) return;
  await tx
    .insert(billPurchaseOrder)
    .values(unique.map((purchaseOrderId) => ({ billId, purchaseOrderId })))
    .onConflictDoNothing();
}
