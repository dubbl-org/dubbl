import { db } from "@/lib/db";
import {
  bill,
  chartAccount,
  inventoryItem,
  inventoryMovement,
  journalEntry,
  journalLine,
  landedCostAllocation,
  landedCostComponent,
  landedCostLineAllocation,
  purchaseOrder,
  purchaseOrderLine,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import {
  ensureAccountByCode,
  ensureControlAccount,
  getNextEntryNumber,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { convertAmount } from "@/lib/currency/converter";
import {
  assertInventoryPeriodOpen,
  fail,
  inventoryAccountFor,
  spreadValueAcrossFifoLayers,
  todayIso,
  type OpsContext,
} from "@/lib/api/inventory-ops";
import { splitByBasis, splitCostOnHand } from "@/lib/inventory/math";

/**
 * Landed costs (freight, duty, insurance and the like), shared by the REST
 * routes and the MCP tools. All amounts are integer cents in the allocation's
 * currency; purchase order line quantities are stored x100.
 *
 * Applying ("allocating") spreads each cost across the lines of the linked
 * purchase order, then posts one entry in the base currency:
 *   DR the item's Inventory account        share for units still on hand
 *   DR the item's cost of sales (or 5000)  share for units already sold
 *   DR the PO line's account               share for lines with no stock item
 *   CR the cost's account (if set) or 2160 Landed Costs Clearing
 * Pick the account the freight bill was coded to as the cost's account so the
 * cost moves out of that account into stock.
 */

export const LANDED_COST_METHODS = ["by_value", "by_quantity", "manual"] as const;
export type LandedCostMethod = (typeof LANDED_COST_METHODS)[number];

export interface LandedCostComponentInput {
  description: string;
  /** Cents. */
  amount: number;
  accountId?: string | null;
}

export interface LandedCostInput {
  name: string;
  billId?: string | null;
  purchaseOrderId?: string | null;
  allocationMethod?: LandedCostMethod;
  currencyCode?: string;
  components: LandedCostComponentInput[];
}

const DETAIL_WITH = {
  components: { with: { account: { columns: { id: true, code: true, name: true } } } },
  lineAllocations: true,
  bill: true,
  purchaseOrder: {
    with: {
      lines: { with: { account: { columns: { id: true, code: true, name: true } } } },
      contact: { columns: { id: true, name: true } },
    },
  },
  journalEntry: { columns: { id: true, entryNumber: true, date: true } },
} as const;

export async function listLandedCosts(organizationId: string, opts: { limit: number; offset: number }) {
  const where = and(eq(landedCostAllocation.organizationId, organizationId), notDeleted(landedCostAllocation.deletedAt));
  const items = await db.query.landedCostAllocation.findMany({
    where,
    orderBy: desc(landedCostAllocation.createdAt),
    limit: opts.limit,
    offset: opts.offset,
    with: { components: true, bill: true, purchaseOrder: true },
  });
  const [count] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(landedCostAllocation)
    .where(where);
  return { items, total: Number(count?.count ?? 0) };
}

/** One landed cost with its costs, results, bill, and PO lines (each with its stock item). */
export async function getLandedCost(organizationId: string, id: string) {
  const row = await db.query.landedCostAllocation.findFirst({
    where: and(
      eq(landedCostAllocation.id, id),
      eq(landedCostAllocation.organizationId, organizationId),
      notDeleted(landedCostAllocation.deletedAt)
    ),
    with: DETAIL_WITH,
  });
  if (!row?.purchaseOrder) return row;
  const itemIds = [...new Set(row.purchaseOrder.lines.map((l) => l.inventoryItemId).filter((x): x is string => !!x))];
  const items = itemIds.length
    ? await db
        .select({ id: inventoryItem.id, name: inventoryItem.name, code: inventoryItem.code, quantityOnHand: inventoryItem.quantityOnHand })
        .from(inventoryItem)
        .where(and(eq(inventoryItem.organizationId, organizationId), inArray(inventoryItem.id, itemIds)))
    : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    ...row,
    purchaseOrder: {
      ...row.purchaseOrder,
      lines: row.purchaseOrder.lines.map((l) => ({ ...l, inventoryItem: l.inventoryItemId ? byId.get(l.inventoryItemId) ?? null : null })),
    },
  };
}

/** Check the linked bill, PO and accounts all belong to this organization. */
async function validateLinks(
  organizationId: string,
  input: { billId?: string | null; purchaseOrderId?: string | null; components?: LandedCostComponentInput[] }
) {
  let currency: string | null = null;
  if (input.purchaseOrderId) {
    const po = await db.query.purchaseOrder.findFirst({
      where: and(eq(purchaseOrder.id, input.purchaseOrderId), eq(purchaseOrder.organizationId, organizationId), notDeleted(purchaseOrder.deletedAt)),
      columns: { id: true, currencyCode: true },
    });
    if (!po) fail("Purchase order not found", 404);
    currency = po.currencyCode;
  }
  if (input.billId) {
    const b = await db.query.bill.findFirst({
      where: and(eq(bill.id, input.billId), eq(bill.organizationId, organizationId), notDeleted(bill.deletedAt)),
      columns: { id: true, currencyCode: true },
    });
    if (!b) fail("Bill not found", 404);
    currency = b.currencyCode ?? currency;
  }
  const accountIds = [...new Set((input.components ?? []).map((c) => c.accountId).filter((a): a is string => !!a))];
  if (accountIds.length > 0) {
    const found = await db
      .select({ id: chartAccount.id })
      .from(chartAccount)
      .where(and(eq(chartAccount.organizationId, organizationId), inArray(chartAccount.id, accountIds)));
    if (found.length !== accountIds.length) fail("Account not found", 404);
  }
  for (const c of input.components ?? []) {
    if (!Number.isInteger(c.amount) || c.amount < 0) fail("Cost amounts must be whole cents, 0 or more");
  }
  return { currency };
}

export async function createLandedCost(ctx: OpsContext, input: LandedCostInput) {
  if (input.components.length === 0) fail("Add at least one cost");
  const { currency } = await validateLinks(ctx.organizationId, input);
  const base = input.currencyCode ? null : (await resolveBaseRate(ctx.organizationId, undefined, todayIso())).base;
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(landedCostAllocation)
      .values({
        organizationId: ctx.organizationId,
        name: input.name,
        billId: input.billId || null,
        purchaseOrderId: input.purchaseOrderId || null,
        allocationMethod: input.allocationMethod ?? "by_value",
        totalCostAmount: input.components.reduce((s, c) => s + c.amount, 0),
        currencyCode: input.currencyCode ?? currency ?? base ?? "USD",
        createdBy: ctx.userId,
      })
      .returning();
    await tx.insert(landedCostComponent).values(
      input.components.map((c) => ({
        allocationId: created.id,
        description: c.description,
        amount: c.amount,
        accountId: c.accountId || null,
      }))
    );
    return created.id;
  });
  return getLandedCost(ctx.organizationId, id);
}

async function loadDraft(organizationId: string, id: string) {
  const row = await db.query.landedCostAllocation.findFirst({
    where: and(
      eq(landedCostAllocation.id, id),
      eq(landedCostAllocation.organizationId, organizationId),
      notDeleted(landedCostAllocation.deletedAt)
    ),
  });
  if (!row) fail("Landed cost not found", 404);
  if (row.status !== "draft") fail("This landed cost has already been applied, so it can't be changed", 409);
  return row;
}

/** Change a landed cost that hasn't been applied. `components` replaces all costs. */
export async function updateLandedCost(ctx: OpsContext, id: string, input: Partial<LandedCostInput>) {
  await loadDraft(ctx.organizationId, id);
  await validateLinks(ctx.organizationId, input);
  if (input.components && input.components.length === 0) fail("Add at least one cost");
  await db.transaction(async (tx) => {
    await tx
      .update(landedCostAllocation)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.billId !== undefined ? { billId: input.billId || null } : {}),
        ...(input.purchaseOrderId !== undefined ? { purchaseOrderId: input.purchaseOrderId || null } : {}),
        ...(input.allocationMethod !== undefined ? { allocationMethod: input.allocationMethod } : {}),
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
        ...(input.components ? { totalCostAmount: input.components.reduce((s, c) => s + c.amount, 0) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(landedCostAllocation.id, id));
    if (input.components) {
      await tx.delete(landedCostComponent).where(eq(landedCostComponent.allocationId, id));
      await tx.insert(landedCostComponent).values(
        input.components.map((c) => ({ allocationId: id, description: c.description, amount: c.amount, accountId: c.accountId || null }))
      );
    }
  });
  return getLandedCost(ctx.organizationId, id);
}

/** Delete a landed cost that hasn't been applied (an applied one has posted entries). */
export async function deleteLandedCost(ctx: OpsContext, id: string) {
  const row = await loadDraft(ctx.organizationId, id);
  await db.update(landedCostAllocation).set(softDelete()).where(eq(landedCostAllocation.id, id));
  return row;
}

/**
 * Apply a landed cost. For the "manual" method pass `manualAmounts`: the
 * amount (cents) for each purchase order line, adding up to the total.
 */
export async function allocateLandedCost(
  ctx: OpsContext,
  id: string,
  opts: { manualAmounts?: { purchaseOrderLineId: string; amount: number }[]; date?: string } = {}
) {
  const date = opts.date ?? todayIso();
  await assertInventoryPeriodOpen(ctx.organizationId, date, ctx);
  const allocation = await loadDraft(ctx.organizationId, id);
  if (!allocation.purchaseOrderId) fail("Link the purchase order these costs belong to before applying");
  const components = await db.query.landedCostComponent.findMany({ where: eq(landedCostComponent.allocationId, id) });
  if (components.length === 0 || allocation.totalCostAmount <= 0) fail("Add the costs before applying");

  const po = await db.query.purchaseOrder.findFirst({
    where: and(eq(purchaseOrder.id, allocation.purchaseOrderId), eq(purchaseOrder.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!po) fail("Purchase order not found", 404);
  const poLines = await db.query.purchaseOrderLine.findMany({
    where: eq(purchaseOrderLine.purchaseOrderId, po.id),
    orderBy: purchaseOrderLine.sortOrder,
  });
  if (poLines.length === 0) fail("The purchase order has no lines");

  // Basis per PO line.
  let bases: number[];
  if (allocation.allocationMethod === "manual") {
    const manual = new Map((opts.manualAmounts ?? []).map((m) => [m.purchaseOrderLineId, m.amount]));
    for (const lineId of manual.keys()) {
      if (!poLines.some((l) => l.id === lineId)) fail("A manual amount is for a line that isn't on the purchase order");
    }
    bases = poLines.map((l) => manual.get(l.id) ?? 0);
    if (bases.some((b) => !Number.isInteger(b) || b < 0)) fail("Manual amounts must be whole cents, 0 or more");
    const sum = bases.reduce((s, b) => s + b, 0);
    if (sum !== allocation.totalCostAmount) {
      fail(`The manual amounts add up to ${sum} cents, but the costs total ${allocation.totalCostAmount} cents`);
    }
  } else if (allocation.allocationMethod === "by_quantity") {
    bases = poLines.map((l) => l.quantity);
  } else if (allocation.allocationMethod === "by_value") {
    bases = poLines.map((l) => l.amount);
  } else {
    fail("Weight-based splitting isn't available (items have no weight). Choose by value, by quantity or manual.");
  }
  if (bases.reduce((s, b) => s + Math.max(0, b), 0) <= 0) fail("The purchase order lines have nothing to split the cost by");

  const { base, rate } = await resolveBaseRate(ctx.organizationId, allocation.currencyCode, date);

  const result = await db.transaction(async (tx) => {
    // Claim first so a double click can't apply twice.
    const [claimed] = await tx
      .update(landedCostAllocation)
      .set({ status: "allocated", allocatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(landedCostAllocation.id, id), eq(landedCostAllocation.status, "draft")))
      .returning();
    if (!claimed) fail("This landed cost was changed by someone else. Refresh and try again.", 409);

    // Items behind the lines (locked), and units bought per item.
    const itemIds = [...new Set(poLines.map((l) => l.inventoryItemId).filter((x): x is string => !!x))];
    const items = itemIds.length
      ? await tx
          .select()
          .from(inventoryItem)
          .where(and(eq(inventoryItem.organizationId, ctx.organizationId), inArray(inventoryItem.id, itemIds)))
          .for("update")
      : [];
    const itemById = new Map(items.map((i) => [i.id, i]));
    const unitsBought = new Map<string, number>();
    for (const l of poLines) {
      if (!l.inventoryItemId) continue;
      const units = (l.quantityReceived > 0 ? l.quantityReceived : l.quantity) / 100;
      unitsBought.set(l.inventoryItemId, (unitsBought.get(l.inventoryItemId) ?? 0) + units);
    }

    const clearing = await ensureAccountByCode(
      ctx.organizationId,
      { code: "2160", name: "Landed Costs Clearing", type: "liability", subType: "current" },
      base,
      tx
    );
    if (!clearing) fail("Couldn't find or create the Landed Costs Clearing account", 500);
    const cogsDefault = await ensureControlAccount(ctx.organizationId, "cogs", base, tx);

    const net = new Map<string, number>(); // account -> debit (+) / credit (-), base currency
    const add = (accountId: string, amount: number) => net.set(accountId, (net.get(accountId) ?? 0) + amount);
    const capitalizedByItem = new Map<string, number>();
    const expensedByItem = new Map<string, number>();
    const rows: (typeof landedCostLineAllocation.$inferInsert)[] = [];

    for (const component of components) {
      const docShares = splitByBasis(component.amount, bases);
      const baseShares = splitByBasis(convertAmount(component.amount, rate), bases);
      const creditAcct = component.accountId ?? clearing.id;
      poLines.forEach((line, i) => {
        if (docShares[i] !== 0) {
          rows.push({
            allocationId: id,
            componentId: component.id,
            purchaseOrderLineId: line.id,
            allocatedAmount: docShares[i],
            allocationBasis: bases[i],
          });
        }
        const share = baseShares[i];
        if (share === 0) return;
        add(creditAcct, -share);
        const item = line.inventoryItemId ? itemById.get(line.inventoryItemId) : undefined;
        if (!item) {
          // Not a stock line: the cost belongs with whatever the line was for.
          add(line.accountId ?? creditAcct, share);
          return;
        }
        const { capitalized, expensed } = splitCostOnHand(share, item.quantityOnHand, unitsBought.get(item.id) ?? 0);
        capitalizedByItem.set(item.id, (capitalizedByItem.get(item.id) ?? 0) + capitalized);
        expensedByItem.set(item.id, (expensedByItem.get(item.id) ?? 0) + expensed);
      });
    }

    // Revalue the stock still on hand; the rest goes to cost of sales.
    const movementIds: string[] = [];
    for (const item of items) {
      const capitalized = capitalizedByItem.get(item.id) ?? 0;
      const expensed = expensedByItem.get(item.id) ?? 0;
      if (capitalized !== 0) {
        const newValue = item.totalValue + capitalized;
        await tx
          .update(inventoryItem)
          .set({
            totalValue: newValue,
            averageCost: item.quantityOnHand > 0 ? Math.round(newValue / item.quantityOnHand) : item.averageCost,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItem.id, item.id));
        await spreadValueAcrossFifoLayers(tx, item, capitalized);
        const [movement] = await tx
          .insert(inventoryMovement)
          .values({
            organizationId: ctx.organizationId,
            inventoryItemId: item.id,
            type: "adjustment",
            quantity: 0,
            previousQuantity: item.quantityOnHand,
            newQuantity: item.quantityOnHand,
            unitCost: 0,
            value: capitalized,
            reason: `Landed cost: ${allocation.name}`,
            referenceType: "landed_cost",
            referenceId: id,
            createdBy: ctx.userId,
          })
          .returning();
        movementIds.push(movement.id);
        add((await inventoryAccountFor(ctx.organizationId, item, base, tx)).id, capitalized);
      }
      if (expensed !== 0) {
        const cogs = item.costAccountId ?? cogsDefault?.id;
        if (!cogs) fail("Couldn't find or create the Cost of Goods Sold account", 500);
        add(cogs, expensed);
      }
    }

    let entryId: string | null = null;
    const lines = [...net.entries()].filter(([, v]) => v !== 0);
    if (lines.length > 0) {
      const description = `Landed cost: ${allocation.name}`;
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date,
          description,
          reference: "LANDED-COST",
          status: "posted",
          sourceType: "landed_cost",
          sourceId: id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();
      entryId = entry.id;
      await tx.insert(journalLine).values(
        lines.map(([accountId, v]) => ({
          journalEntryId: entry.id,
          accountId,
          description,
          debitAmount: v > 0 ? v : 0,
          creditAmount: v < 0 ? -v : 0,
          currencyCode: base,
        }))
      );
      if (movementIds.length) {
        await tx.update(inventoryMovement).set({ journalEntryId: entry.id }).where(inArray(inventoryMovement.id, movementIds));
      }
      await tx.update(landedCostAllocation).set({ journalEntryId: entry.id }).where(eq(landedCostAllocation.id, id));
    }
    if (rows.length) await tx.insert(landedCostLineAllocation).values(rows);

    return {
      journalEntryId: entryId,
      addedToStock: [...capitalizedByItem.values()].reduce((s, v) => s + v, 0),
      toCostOfSales: [...expensedByItem.values()].reduce((s, v) => s + v, 0),
    };
  });

  return { allocation: await getLandedCost(ctx.organizationId, id), ...result };
}
