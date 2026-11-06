import { db } from "@/lib/db";
import {
  chartAccount,
  inventoryItem,
  inventoryMovement,
  inventoryCostLayer,
  journalEntry,
  journalLine,
  warehouse,
} from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import { assertNotLocked, PeriodLockedError } from "@/lib/api/period-lock";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  ensureAccountByCode,
  ensureControlAccount,
  getNextEntryNumber,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { recordInventoryReceipt, type ValuedItem } from "@/lib/api/inventory-valuation";
import { splitByBasis, unitBookCost } from "@/lib/inventory/math";

/**
 * Shared inventory operations used by both the REST routes and the MCP tools,
 * so the two paths post identical stock movements and journal entries.
 * Money is integer cents; quantities are whole units.
 */

export type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type DbOrTx = typeof db | Tx;

export interface OpsContext {
  organizationId: string;
  userId: string;
}

/**
 * Throw a user-facing error with an HTTP status. AuthError carries a status and
 * is surfaced with its message by both handleError (REST) and wrapTool (MCP).
 */
export function fail(message: string, status = 400): never {
  throw new AuthError(message, status);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Block postings into a locked period or closed fiscal year (422). */
export async function assertInventoryPeriodOpen(
  organizationId: string,
  date: string,
  ctx?: AuthContext | OpsContext
): Promise<void> {
  try {
    // A full AuthContext lets advisors use their own lock date.
    const auth = ctx && "role" in ctx ? (ctx as AuthContext) : undefined;
    await assertNotLocked(organizationId, date, auth);
  } catch (err) {
    if (err instanceof PeriodLockedError) fail(err.message, 422);
    throw err;
  }
}

/** The item's own inventory account, else the Inventory control account (1300). */
export async function inventoryAccountFor(
  organizationId: string,
  item: { inventoryAccountId?: string | null },
  base: string,
  tx: Tx
): Promise<{ id: string }> {
  if (item.inventoryAccountId) return { id: item.inventoryAccountId };
  const acct = await ensureControlAccount(organizationId, "inventory", base, tx);
  if (!acct) throw new Error("Inventory control account unavailable");
  return acct;
}

/**
 * Check the accounts an item points at belong to the org and have a sensible
 * type: inventory = asset, cost of sales = expense, sales = revenue.
 */
export async function assertItemAccounts(
  organizationId: string,
  accounts: { inventoryAccountId?: string | null; costAccountId?: string | null; revenueAccountId?: string | null },
  exec: DbOrTx = db
): Promise<void> {
  const checks: [string | null | undefined, string, string][] = [
    [accounts.inventoryAccountId, "asset", "Inventory account"],
    [accounts.costAccountId, "expense", "Cost of sales account"],
    [accounts.revenueAccountId, "revenue", "Sales account"],
  ];
  for (const [id, type, label] of checks) {
    if (!id) continue;
    const acct = await exec.query.chartAccount.findFirst({
      where: and(eq(chartAccount.id, id), eq(chartAccount.organizationId, organizationId)),
      columns: { id: true, type: true },
    });
    if (!acct) fail(`${label} not found`, 404);
    if (acct.type !== type) fail(`${label} must be ${type === "asset" ? "an" : "a"} ${type} account`);
  }
}

/** Reject codes already used by another item in the org (409). */
export async function assertItemCodeFree(
  organizationId: string,
  code: string,
  exceptId?: string,
  exec: DbOrTx = db
): Promise<void> {
  const clash = await exec.query.inventoryItem.findFirst({
    where: and(eq(inventoryItem.organizationId, organizationId), eq(inventoryItem.code, code)),
    columns: { id: true, deletedAt: true },
  });
  if (clash && clash.id !== exceptId) {
    fail(
      clash.deletedAt
        ? `The code "${code}" belongs to a deleted item. Restore it from the trash or use another code.`
        : `Another item already uses the code "${code}"`,
      409
    );
  }
}

/** The active default location, if the org has one. */
export async function getDefaultWarehouseId(
  organizationId: string,
  exec: DbOrTx = db
): Promise<string | null> {
  const found = await exec.query.warehouse.findFirst({
    where: and(
      eq(warehouse.organizationId, organizationId),
      eq(warehouse.isDefault, true),
      eq(warehouse.isActive, true),
      notDeleted(warehouse.deletedAt)
    ),
    columns: { id: true },
  });
  return found?.id ?? null;
}

/**
 * For a FIFO item, spread a change in book value across its open cost layers
 * (by remaining units) so later issues are costed at the adjusted layer cost.
 * No-op for average-cost items or when nothing is left in the layers.
 */
export async function spreadValueAcrossFifoLayers(
  tx: Tx,
  item: { id: string; organizationId: string; costMethod: string },
  valueDelta: number
): Promise<void> {
  if (item.costMethod !== "fifo" || valueDelta === 0) return;
  const layers = await tx
    .select()
    .from(inventoryCostLayer)
    .where(
      and(
        eq(inventoryCostLayer.organizationId, item.organizationId),
        eq(inventoryCostLayer.inventoryItemId, item.id),
        sql`${inventoryCostLayer.remainingQuantity} > 0`
      )
    )
    .orderBy(asc(inventoryCostLayer.receivedAt), asc(inventoryCostLayer.id))
    .for("update");
  if (layers.length === 0) return;
  const shares = splitByBasis(valueDelta, layers.map((l) => l.remainingQuantity));
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const newUnitCost = Math.max(
      0,
      Math.round((layer.unitCost * layer.remainingQuantity + shares[i]) / layer.remainingQuantity)
    );
    await tx
      .update(inventoryCostLayer)
      .set({ unitCost: newUnitCost })
      .where(eq(inventoryCostLayer.id, layer.id));
  }
}

/**
 * Change an item's book value without changing the count, and post it.
 *   write_down (value down):      DR Inventory Write-Down 5020 / CR Inventory
 *   revaluation down:             DR Inventory Write-Down 5020 / CR Inventory
 *   revaluation up (a reversal):  DR Inventory / CR Inventory Write-Down 5020
 * Inventory is carried at the lower of cost and net realisable value, so an
 * increase reverses earlier write-downs through the same account rather than
 * going to an equity revaluation surplus (that treatment is for fixed assets).
 */
export async function postInventoryValueChange(
  ctx: OpsContext,
  args: {
    itemId: string;
    valueDelta: number; // signed cents, negative = lower the value
    kind: "write_down" | "revaluation";
    reason: string;
    date: string;
  }
): Promise<{ movementId: string; entryId: string; previousValue: number; newValue: number }> {
  if (args.valueDelta === 0) fail("The value didn't change");
  return db.transaction(async (tx) => {
    const item = await tx.query.inventoryItem.findFirst({
      where: and(eq(inventoryItem.id, args.itemId), eq(inventoryItem.organizationId, ctx.organizationId)),
    });
    if (!item) fail("Inventory item not found", 404);
    const previousValue = item.totalValue;
    const newValue = previousValue + args.valueDelta;
    if (newValue < 0) {
      fail(args.kind === "write_down" ? "Write-down exceeds current inventory value" : "The new value can't be below zero");
    }
    const qty = item.quantityOnHand;
    const newAvgCost = qty > 0 ? Math.round(newValue / qty) : item.averageCost;

    const { base } = await resolveBaseRate(ctx.organizationId, undefined, args.date);
    const invAcct = await inventoryAccountFor(ctx.organizationId, item, base, tx);
    const writeDownAcct = await ensureControlAccount(ctx.organizationId, "inventoryWriteDown", base, tx);
    if (!writeDownAcct) throw new Error("Inventory Write-Down account unavailable");

    await tx
      .update(inventoryItem)
      .set({ totalValue: newValue, averageCost: newAvgCost, updatedAt: new Date() })
      .where(eq(inventoryItem.id, item.id));
    await spreadValueAcrossFifoLayers(tx, item, args.valueDelta);

    const label = args.kind === "write_down" ? "Inventory write-down" : "Inventory revaluation";
    const description = `${label}${args.reason ? ` - ${args.reason}` : ""}`;
    const [movement] = await tx
      .insert(inventoryMovement)
      .values({
        organizationId: ctx.organizationId,
        inventoryItemId: item.id,
        type: "adjustment",
        quantity: 0,
        previousQuantity: qty,
        newQuantity: qty,
        unitCost: 0,
        value: args.valueDelta,
        reason: description,
        referenceType: args.kind,
        referenceId: null,
        createdBy: ctx.userId,
      })
      .returning();

    const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
    const [entry] = await tx
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: args.date,
        description,
        reference: args.kind === "write_down" ? "INV-WD" : "INV-REVAL",
        status: "posted",
        sourceType: args.kind === "write_down" ? "inventory_write_down" : "inventory_revaluation",
        sourceId: item.id,
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    const amount = Math.abs(args.valueDelta);
    const decrease = args.valueDelta < 0;
    await tx.insert(journalLine).values(
      decrease
        ? [
            { journalEntryId: entry.id, accountId: writeDownAcct.id, description: label, debitAmount: amount, creditAmount: 0, currencyCode: base },
            { journalEntryId: entry.id, accountId: invAcct.id, description: label, debitAmount: 0, creditAmount: amount, currencyCode: base },
          ]
        : [
            { journalEntryId: entry.id, accountId: invAcct.id, description: label, debitAmount: amount, creditAmount: 0, currencyCode: base },
            { journalEntryId: entry.id, accountId: writeDownAcct.id, description: label, debitAmount: 0, creditAmount: amount, currencyCode: base },
          ]
    );
    await tx.update(inventoryMovement).set({ journalEntryId: entry.id }).where(eq(inventoryMovement.id, movement.id));

    return { movementId: movement.id, entryId: entry.id, previousValue, newValue };
  });
}

/**
 * Receive opening stock for an item through the costing engine (movement,
 * average cost, FIFO layer, location stock). No journal entry: pair it with
 * postOpeningStockEntry. Returns the book value added.
 */
export async function receiveOpeningStock(
  tx: Tx,
  args: {
    item: ValuedItem;
    quantity: number;
    unitCost: number;
    warehouseId?: string | null;
    createdBy?: string | null;
  }
): Promise<{ movementId: string; value: number }> {
  const r = await recordInventoryReceipt(tx, {
    item: args.item,
    quantity: args.quantity,
    unitCost: args.unitCost,
    warehouseId: args.warehouseId ?? null,
    type: "initial",
    referenceType: "opening_balance",
    referenceId: args.item.id,
    createdBy: args.createdBy ?? null,
  });
  return { movementId: r.movementId, value: args.quantity * args.unitCost };
}

/**
 * Post opening stock to the ledger: DR each inventory account / CR Opening
 * Balance Equity (3000). Stamps the given movements with the entry id.
 */
export async function postOpeningStockEntry(
  tx: Tx,
  ctx: OpsContext,
  args: {
    lines: { item: { inventoryAccountId?: string | null }; value: number; movementId?: string }[];
    description: string;
    reference?: string | null;
    sourceId?: string | null;
    date: string;
  }
): Promise<string | null> {
  const total = args.lines.reduce((s, l) => s + l.value, 0);
  if (total <= 0) return null;
  const { base } = await resolveBaseRate(ctx.organizationId, undefined, args.date);
  const openingEquity = await ensureAccountByCode(
    ctx.organizationId,
    { code: "3000", name: "Opening Balance Equity", type: "equity", subType: "other_equity" },
    base,
    tx
  );
  if (!openingEquity) throw new Error("Opening Balance Equity account unavailable");

  const debits = new Map<string, number>();
  for (const l of args.lines) {
    if (l.value <= 0) continue;
    const acct = await inventoryAccountFor(ctx.organizationId, l.item, base, tx);
    debits.set(acct.id, (debits.get(acct.id) ?? 0) + l.value);
  }

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: args.date,
      description: args.description,
      reference: args.reference ?? null,
      status: "posted",
      sourceType: "inventory_opening",
      sourceId: args.sourceId ?? null,
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();
  await tx.insert(journalLine).values([
    ...Array.from(debits, ([accountId, amount]) => ({
      journalEntryId: entry.id,
      accountId,
      description: args.description,
      debitAmount: amount,
      creditAmount: 0,
      currencyCode: base,
    })),
    { journalEntryId: entry.id, accountId: openingEquity.id, description: args.description, debitAmount: 0, creditAmount: total, currencyCode: base },
  ]);
  for (const l of args.lines) {
    if (l.movementId) {
      await tx.update(inventoryMovement).set({ journalEntryId: entry.id }).where(eq(inventoryMovement.id, l.movementId));
    }
  }
  return entry.id;
}

/**
 * Switch an item between average cost and FIFO without changing its book value.
 *   to FIFO:    the units on hand become one cost layer at the current unit cost
 *   to average: the average becomes book value / units, and old layers are closed
 * Standard costing isn't available yet.
 */
export async function changeCostMethod(
  tx: Tx,
  item: { id: string; organizationId: string; costMethod: string; quantityOnHand: number; totalValue: number; averageCost: number },
  method: "average" | "fifo" | "standard"
): Promise<void> {
  if (method === item.costMethod) return;
  if (method === "standard") fail("Standard costing isn't available yet. Use average cost or FIFO.");

  // Close any layers left over from an earlier FIFO period.
  await tx
    .update(inventoryCostLayer)
    .set({ remainingQuantity: 0 })
    .where(
      and(
        eq(inventoryCostLayer.organizationId, item.organizationId),
        eq(inventoryCostLayer.inventoryItemId, item.id)
      )
    );

  const unitCost = unitBookCost(item);
  if (method === "fifo" && item.quantityOnHand > 0) {
    await tx.insert(inventoryCostLayer).values({
      organizationId: item.organizationId,
      inventoryItemId: item.id,
      originalQuantity: item.quantityOnHand,
      remainingQuantity: item.quantityOnHand,
      unitCost,
    });
  }

  await tx
    .update(inventoryItem)
    .set({ costMethod: method, averageCost: unitCost, updatedAt: new Date() })
    .where(eq(inventoryItem.id, item.id));
}
