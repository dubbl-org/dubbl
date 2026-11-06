import { db } from "@/lib/db";
import {
  assemblyOrder,
  billOfMaterials,
  bomComponent,
  inventoryItem,
  inventoryMovement,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ensureAccountByCode, getNextEntryNumber, resolveBaseRate } from "@/lib/api/journal-automation";
import { recordInventoryIssue, recordInventoryReceipt, type ValuedItem } from "@/lib/api/inventory-valuation";
import {
  assertInventoryPeriodOpen,
  fail,
  inventoryAccountFor,
  todayIso,
  type OpsContext,
} from "@/lib/api/inventory-ops";
import { componentUnitsNeeded, unitBookCost } from "@/lib/inventory/math";

/**
 * Bills of materials and assembly orders, shared by the REST routes and the
 * MCP tools. Labour and overhead are integer cents per finished unit;
 * component quantities are per finished unit (decimals allowed) with an
 * optional wastage percentage.
 *
 * Assembly order statuses: draft (planned), in_progress (being built; nothing
 * is reserved), completed (built: parts used up, finished items added and
 * one journal entry posted) and cancelled.
 */

// ─── Bills of materials ───────────────────────────────────────────────

async function assertOrgItem(organizationId: string, itemId: string, label: string) {
  const item = await db.query.inventoryItem.findFirst({
    where: and(eq(inventoryItem.id, itemId), eq(inventoryItem.organizationId, organizationId), notDeleted(inventoryItem.deletedAt)),
    columns: { id: true, name: true },
  });
  if (!item) fail(`${label} not found`, 404);
  return item;
}

async function loadBom(organizationId: string, id: string) {
  const bom = await db.query.billOfMaterials.findFirst({
    where: and(eq(billOfMaterials.id, id), eq(billOfMaterials.organizationId, organizationId), notDeleted(billOfMaterials.deletedAt)),
  });
  if (!bom) fail("Bill of materials not found", 404);
  return bom;
}

type CostedComponent = {
  quantity: string;
  wastagePercent: string | null;
  componentItem: { quantityOnHand: number; totalValue: number; averageCost: number; purchasePrice: number } | null;
};

/**
 * Estimated cost to build one unit, from each part's current book cost per
 * unit (falling back to its purchase price when none is on hand).
 */
export function estimateBomCost(bom: { laborCostCents: number; overheadCostCents: number; components: CostedComponent[] }) {
  const componentCost = Math.round(
    bom.components.reduce((sum, c) => {
      const qty = parseFloat(c.quantity) * (1 + parseFloat(c.wastagePercent || "0") / 100);
      return sum + qty * (c.componentItem ? unitBookCost(c.componentItem) : 0);
    }, 0)
  );
  return {
    componentCost,
    laborCost: bom.laborCostCents,
    overheadCost: bom.overheadCostCents,
    totalCost: componentCost + bom.laborCostCents + bom.overheadCostCents,
  };
}

export async function listBoms(organizationId: string) {
  const boms = await db.query.billOfMaterials.findMany({
    where: and(eq(billOfMaterials.organizationId, organizationId), notDeleted(billOfMaterials.deletedAt)),
    with: { assemblyItem: true, components: { with: { componentItem: true } } },
    orderBy: billOfMaterials.createdAt,
  });
  return boms.map((bom) => ({ ...bom, costBreakdown: estimateBomCost(bom) }));
}

export async function getBom(organizationId: string, id: string) {
  const bom = await db.query.billOfMaterials.findFirst({
    where: and(eq(billOfMaterials.id, id), eq(billOfMaterials.organizationId, organizationId), notDeleted(billOfMaterials.deletedAt)),
    with: { assemblyItem: true, components: { with: { componentItem: true } } },
  });
  if (!bom) return null;
  return { bom, costBreakdown: estimateBomCost(bom) };
}

export interface ComponentInput {
  componentItemId: string;
  quantity: number;
  wastagePercent?: number;
}

function checkComponent(assemblyItemId: string, c: { componentItemId: string; quantity?: number; wastagePercent?: number }) {
  if (c.componentItemId === assemblyItemId) fail("An item can't be a part of itself");
  if (c.quantity !== undefined && !(c.quantity > 0)) fail("Quantity per unit must be more than 0");
  if (c.wastagePercent !== undefined && (c.wastagePercent < 0 || c.wastagePercent > 1000)) fail("Wastage must be between 0 and 1000%");
}

export async function createBom(
  ctx: OpsContext,
  input: {
    assemblyItemId: string;
    name: string;
    description?: string | null;
    laborCostCents?: number;
    overheadCostCents?: number;
    components?: ComponentInput[];
  }
) {
  await assertOrgItem(ctx.organizationId, input.assemblyItemId, "Finished item");
  const components = input.components ?? [];
  for (const c of components) {
    checkComponent(input.assemblyItemId, c);
    await assertOrgItem(ctx.organizationId, c.componentItemId, "Part");
  }
  const id = await db.transaction(async (tx) => {
    const [bom] = await tx
      .insert(billOfMaterials)
      .values({
        organizationId: ctx.organizationId,
        assemblyItemId: input.assemblyItemId,
        name: input.name,
        description: input.description ?? null,
        laborCostCents: input.laborCostCents ?? 0,
        overheadCostCents: input.overheadCostCents ?? 0,
      })
      .returning();
    if (components.length > 0) {
      await tx.insert(bomComponent).values(
        components.map((c) => ({
          bomId: bom.id,
          componentItemId: c.componentItemId,
          quantity: String(c.quantity),
          wastagePercent: String(c.wastagePercent ?? 0),
        }))
      );
    }
    return bom.id;
  });
  return getBom(ctx.organizationId, id);
}

export async function updateBom(
  ctx: OpsContext,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    assemblyItemId?: string;
    laborCostCents?: number;
    overheadCostCents?: number;
    isActive?: boolean;
  }
) {
  const bom = await loadBom(ctx.organizationId, id);
  if (input.assemblyItemId && input.assemblyItemId !== bom.assemblyItemId) {
    await assertOrgItem(ctx.organizationId, input.assemblyItemId, "Finished item");
    const clash = await db.query.bomComponent.findFirst({
      where: and(eq(bomComponent.bomId, id), eq(bomComponent.componentItemId, input.assemblyItemId)),
      columns: { id: true },
    });
    if (clash) fail("That item is already one of the parts. Remove it from the parts first.");
  }
  await db
    .update(billOfMaterials)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(billOfMaterials.id, id));
  return getBom(ctx.organizationId, id);
}

export async function deleteBom(ctx: OpsContext, id: string) {
  const bom = await loadBom(ctx.organizationId, id);
  const open = await db.query.assemblyOrder.findFirst({
    where: and(
      eq(assemblyOrder.bomId, id),
      inArray(assemblyOrder.status, ["draft", "in_progress"]),
      notDeleted(assemblyOrder.deletedAt)
    ),
    columns: { id: true },
  });
  if (open) fail("Finish or cancel the open assembly orders for this bill of materials first.", 409);
  await db.update(billOfMaterials).set(softDelete()).where(eq(billOfMaterials.id, id));
  return bom;
}

export async function addBomComponent(ctx: OpsContext, bomId: string, input: ComponentInput) {
  const bom = await loadBom(ctx.organizationId, bomId);
  checkComponent(bom.assemblyItemId, input);
  await assertOrgItem(ctx.organizationId, input.componentItemId, "Part");
  const existing = await db.query.bomComponent.findFirst({
    where: and(eq(bomComponent.bomId, bomId), eq(bomComponent.componentItemId, input.componentItemId)),
    columns: { id: true },
  });
  if (existing) fail("That part is already on this bill of materials. Change its quantity instead.", 409);
  const [component] = await db
    .insert(bomComponent)
    .values({
      bomId,
      componentItemId: input.componentItemId,
      quantity: String(input.quantity),
      wastagePercent: String(input.wastagePercent ?? 0),
    })
    .returning();
  return component;
}

export async function updateBomComponent(
  ctx: OpsContext,
  bomId: string,
  componentId: string,
  input: { quantity?: number; wastagePercent?: number }
) {
  const bom = await loadBom(ctx.organizationId, bomId);
  const component = await db.query.bomComponent.findFirst({
    where: and(eq(bomComponent.id, componentId), eq(bomComponent.bomId, bomId)),
  });
  if (!component) fail("Part not found on this bill of materials", 404);
  checkComponent(bom.assemblyItemId, { componentItemId: component.componentItemId, ...input });
  const [updated] = await db
    .update(bomComponent)
    .set({
      ...(input.quantity !== undefined ? { quantity: String(input.quantity) } : {}),
      ...(input.wastagePercent !== undefined ? { wastagePercent: String(input.wastagePercent) } : {}),
    })
    .where(eq(bomComponent.id, componentId))
    .returning();
  return updated;
}

export async function removeBomComponent(ctx: OpsContext, bomId: string, componentId: string) {
  await loadBom(ctx.organizationId, bomId);
  const [removed] = await db
    .delete(bomComponent)
    .where(and(eq(bomComponent.id, componentId), eq(bomComponent.bomId, bomId)))
    .returning();
  if (!removed) fail("Part not found on this bill of materials", 404);
  return removed;
}

// ─── Assembly orders ──────────────────────────────────────────────────

export async function listAssemblyOrders(organizationId: string) {
  return db.query.assemblyOrder.findMany({
    where: and(eq(assemblyOrder.organizationId, organizationId), notDeleted(assemblyOrder.deletedAt)),
    with: { bom: { with: { assemblyItem: true } } },
    orderBy: desc(assemblyOrder.createdAt),
  });
}

async function loadOrder(organizationId: string, id: string) {
  const order = await db.query.assemblyOrder.findFirst({
    where: and(eq(assemblyOrder.id, id), eq(assemblyOrder.organizationId, organizationId), notDeleted(assemblyOrder.deletedAt)),
  });
  if (!order) fail("Assembly order not found", 404);
  return order;
}

export async function createAssemblyOrder(ctx: OpsContext, input: { bomId: string; quantity: number; notes?: string | null }) {
  const bom = await loadBom(ctx.organizationId, input.bomId);
  if (!bom.isActive) fail("This bill of materials is inactive");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) fail("Build quantity must be a whole number, 1 or more");
  const [order] = await db
    .insert(assemblyOrder)
    .values({ organizationId: ctx.organizationId, bomId: bom.id, quantity: input.quantity, notes: input.notes ?? null })
    .returning();
  return order;
}

/** Change quantity or notes on an order that hasn't been built or cancelled. */
export async function updateAssemblyOrder(ctx: OpsContext, id: string, input: { quantity?: number; notes?: string | null }) {
  const order = await loadOrder(ctx.organizationId, id);
  if (order.status === "completed" || order.status === "cancelled") fail("A built or cancelled order can't be changed");
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 1)) {
    fail("Build quantity must be a whole number, 1 or more");
  }
  const [updated] = await db
    .update(assemblyOrder)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(assemblyOrder.id, id))
    .returning();
  return updated;
}

async function moveStatus(id: string, from: string[], to: "in_progress" | "cancelled") {
  const [row] = await db
    .update(assemblyOrder)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(assemblyOrder.id, id), inArray(assemblyOrder.status, from as ("draft" | "in_progress")[])))
    .returning();
  if (!row) fail("This order was changed by someone else. Refresh and try again.", 409);
  return row;
}

/** Mark as being built. Nothing is reserved; parts are used up on completion. */
export async function startAssemblyOrder(ctx: OpsContext, id: string) {
  const order = await loadOrder(ctx.organizationId, id);
  if (order.status !== "draft") fail(order.status === "in_progress" ? "This order is already in progress" : "Only a draft order can be started");
  return moveStatus(id, ["draft"], "in_progress");
}

export async function cancelAssemblyOrder(ctx: OpsContext, id: string) {
  const order = await loadOrder(ctx.organizationId, id);
  if (order.status === "completed") fail("A built order can't be cancelled");
  if (order.status === "cancelled") fail("This order is already cancelled");
  return moveStatus(id, ["draft", "in_progress"], "cancelled");
}

/**
 * Build an assembly order in one transaction:
 *  1. Use up every part (wastage included, rounded up to whole units) at its
 *     current average or FIFO cost. All stock is checked before anything moves.
 *  2. Add labour + overhead per unit x build quantity.
 *  3. Add the finished items at the rolled-up unit cost.
 *  4. Post one balanced entry: DR the finished item's inventory account (else
 *     Inventory 1300, the same account sales and adjustments relieve) / CR each
 *     part's inventory account / CR 2305 Manufacturing/WIP Clearing for labour,
 *     overhead and rounding.
 */
export async function buildAssemblyOrder(ctx: OpsContext, id: string, date = todayIso()) {
  await assertInventoryPeriodOpen(ctx.organizationId, date, ctx);
  const order = await loadOrder(ctx.organizationId, id);
  if (order.status === "completed") fail("This order is already built", 409);
  if (order.status === "cancelled") fail("This order is cancelled", 409);

  const bom = await db.query.billOfMaterials.findFirst({
    where: eq(billOfMaterials.id, order.bomId),
    with: { components: true },
  });
  if (!bom) fail("Bill of materials not found", 404);
  if (bom.components.length === 0) fail("Add parts to the bill of materials before building", 409);

  // Units of each part, summed in case a part is listed twice.
  const needs = new Map<string, number>();
  for (const c of bom.components) {
    const units = componentUnitsNeeded(parseFloat(c.quantity), order.quantity, parseFloat(c.wastagePercent || "0"));
    needs.set(c.componentItemId, (needs.get(c.componentItemId) ?? 0) + units);
  }
  if (needs.has(bom.assemblyItemId)) fail("The finished item can't be one of its own parts", 409);

  const { base } = await resolveBaseRate(ctx.organizationId, undefined, date);

  const result = await db.transaction(async (tx) => {
    // Claim the order first so a double click can't build twice.
    const [claimed] = await tx
      .update(assemblyOrder)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(assemblyOrder.id, id), inArray(assemblyOrder.status, ["draft", "in_progress"])))
      .returning();
    if (!claimed) fail("This order was changed by someone else. Refresh and try again.", 409);

    // Lock and re-read the parts so the stock check and costs are current.
    const parts = await tx
      .select()
      .from(inventoryItem)
      .where(and(eq(inventoryItem.organizationId, ctx.organizationId), inArray(inventoryItem.id, [...needs.keys()])))
      .for("update");
    const byId = new Map(parts.map((p) => [p.id, p]));
    for (const [itemId, needed] of needs) {
      const part = byId.get(itemId);
      if (!part || part.deletedAt) fail("A part on this bill of materials no longer exists", 409);
      if (part.quantityOnHand < needed) {
        fail(`Not enough ${part.name}: need ${needed}, have ${part.quantityOnHand}`, 409);
      }
    }

    const movementIds: string[] = [];
    const credits = new Map<string, number>(); // inventory account -> cost used
    for (const [itemId, needed] of needs) {
      const part = byId.get(itemId)!;
      const issue = await recordInventoryIssue(tx, {
        item: part as ValuedItem,
        quantity: needed,
        type: "adjustment",
        referenceType: "assembly_order",
        referenceId: order.id,
        createdBy: ctx.userId,
      });
      movementIds.push(issue.movementId);
      const acct = await inventoryAccountFor(ctx.organizationId, part, base, tx);
      credits.set(acct.id, (credits.get(acct.id) ?? 0) + issue.cost);
    }
    const componentCost = [...credits.values()].reduce((s, v) => s + v, 0);
    const conversionCost = (bom.laborCostCents + bom.overheadCostCents) * order.quantity;
    const totalCost = componentCost + conversionCost;
    const unitCost = Math.round(totalCost / order.quantity);

    const finished = await tx.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, bom.assemblyItemId) });
    if (!finished || finished.deletedAt) fail("The finished item no longer exists", 409);
    const receipt = await recordInventoryReceipt(tx, {
      item: finished as ValuedItem,
      quantity: order.quantity,
      unitCost,
      type: "adjustment",
      referenceType: "assembly_order",
      referenceId: order.id,
      createdBy: ctx.userId,
    });
    movementIds.push(receipt.movementId);
    const finishedValue = unitCost * order.quantity;

    const description = `Assembly build: ${bom.name} x${order.quantity}`;
    const finishedAcct = await inventoryAccountFor(ctx.organizationId, finished, base, tx);
    // Shown gross (finished items in, parts out) even when both use the same
    // Inventory account, so the entry reads as the build it records.
    const lines: { accountId: string; description: string; debitAmount: number; creditAmount: number; currencyCode: string }[] = [];
    if (finishedValue !== 0) {
      lines.push({ accountId: finishedAcct.id, description, debitAmount: finishedValue, creditAmount: 0, currencyCode: base });
    }
    for (const [accountId, amount] of credits) {
      if (amount === 0) continue;
      lines.push({ accountId, description: `Parts used: ${bom.name}`, debitAmount: 0, creditAmount: amount, currencyCode: base });
    }
    // Labour and overhead (plus any rounding) balance the entry.
    const clearing = componentCost - finishedValue; // negative = credit
    if (clearing !== 0) {
      const clearingAcct = await ensureAccountByCode(
        ctx.organizationId,
        { code: "2305", name: "Manufacturing/WIP Clearing", type: "liability", subType: "current" },
        base,
        tx
      );
      if (!clearingAcct) fail("Couldn't find or create the Manufacturing/WIP Clearing account", 500);
      lines.push({
        accountId: clearingAcct.id,
        description: `Labour and overhead applied: ${bom.name}`,
        debitAmount: clearing > 0 ? clearing : 0,
        creditAmount: clearing < 0 ? -clearing : 0,
        currencyCode: base,
      });
    }

    let entryId: string | null = null;
    if (lines.length > 0) {
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date,
          description,
          reference: "ASSEMBLY",
          status: "posted",
          sourceType: "assembly_build",
          sourceId: order.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();
      entryId = entry.id;
      await tx.insert(journalLine).values(lines.map((l) => ({ ...l, journalEntryId: entry.id })));
      await tx.update(inventoryMovement).set({ journalEntryId: entry.id }).where(inArray(inventoryMovement.id, movementIds));
    }

    return { order: claimed, journalEntryId: entryId, componentCost, conversionCost, totalCost, unitCost };
  });
  return result;
}
