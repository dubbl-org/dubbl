import { db } from "@/lib/db";
import {
  assemblyOrder,
  inventoryMovement,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  getNextEntryNumber,
  ensureControlAccount,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import {
  recordInventoryIssue,
  recordInventoryReceipt,
  type ValuedItem,
} from "@/lib/api/inventory-valuation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const order = await db.query.assemblyOrder.findFirst({
      where: and(
        eq(assemblyOrder.id, id),
        eq(assemblyOrder.organizationId, ctx.organizationId),
        notDeleted(assemblyOrder.deletedAt)
      ),
      with: {
        bom: {
          with: {
            assemblyItem: true,
            components: { with: { componentItem: true } },
          },
        },
      },
    });

    if (!order) return notFound("Assembly order");
    if (order.status === "completed") return error("Order already completed", 409);
    if (order.status === "cancelled") return error("Order is cancelled", 409);

    const bom = order.bom;
    if (!bom.assemblyItem) return error("BOM has no assembly item", 409);
    if (bom.components.length === 0) return error("BOM has no components", 409);

    // Resolve per-component required quantity (incl. wastage) once, and validate
    // on-hand BEFORE writing anything so a build never leaves stock half-consumed.
    const needs = bom.components.map((comp) => {
      const needed = Math.ceil(
        parseFloat(comp.quantity) *
          order.quantity *
          (1 + parseFloat(comp.wastagePercent || "0") / 100)
      );
      return { comp, item: comp.componentItem, needed };
    });

    for (const { comp, item, needed } of needs) {
      if (!item) {
        return error(`Component item missing for BOM line ${comp.id}`, 409);
      }
      if (item.quantityOnHand < needed) {
        return error(
          `Insufficient stock for ${item.name}: need ${needed}, have ${item.quantityOnHand}`,
          409
        );
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const { base } = await resolveBaseRate(ctx.organizationId, undefined, today);

    const result = await db.transaction(async (tx) => {
      // 1. Issue every component at its current cost, capturing the cost flowed out.
      //    Component movements are stamped with the JE id once it exists.
      const componentMovementIds: string[] = [];
      const componentCredits = new Map<string, number>(); // inventory accountId -> cost
      let componentCost = 0;

      for (const { item, needed } of needs) {
        const valued = item as unknown as ValuedItem;
        const issue = await recordInventoryIssue(tx, {
          item: valued,
          quantity: needed,
          type: "adjustment",
          referenceType: "assembly_order",
          referenceId: order.id,
          createdBy: ctx.userId,
        });
        componentCost += issue.cost;
        componentMovementIds.push(issue.movementId);

        // Credit the component's own inventory account (or the 1300 control).
        const invAcct =
          item!.inventoryAccountId
            ? { id: item!.inventoryAccountId }
            : await ensureControlAccount(ctx.organizationId, "inventory", base, tx);
        if (!invAcct) throw new Error("Inventory control account unavailable");
        componentCredits.set(
          invAcct.id,
          (componentCredits.get(invAcct.id) ?? 0) + issue.cost
        );
      }

      // 2. Labor + overhead from the BOM, scaled by build quantity.
      const conversionCost =
        (bom.laborCostCents + bom.overheadCostCents) * order.quantity;
      const totalCost = componentCost + conversionCost;

      // 3. Receive the finished/assembly item at the rolled-up unit cost so later
      //    sales post a sensible COGS instead of zero.
      const assemblyValued = bom.assemblyItem as unknown as ValuedItem;
      const unitCost =
        order.quantity > 0 ? Math.round(totalCost / order.quantity) : 0;
      const receipt = await recordInventoryReceipt(tx, {
        item: assemblyValued,
        quantity: order.quantity,
        unitCost,
        type: "adjustment",
        referenceType: "assembly_order",
        referenceId: order.id,
        createdBy: ctx.userId,
      });

      // The receipt values the finished item at unitCost*qty (which may differ
      // from totalCost by rounding). Use that value as the inventory debit so the
      // JE balances exactly against the receipt's effect on the ledger.
      const finishedValue = unitCost * order.quantity;

      // 4. Build the balanced JE.
      //    DR Finished Goods inventory (assembly item account or 1320)
      //    CR each consumed component's inventory account (componentCredits)
      //    CR Manufacturing/WIP Clearing 2305 for labor + overhead
      const finishedAcct =
        bom.assemblyItem!.inventoryAccountId
          ? { id: bom.assemblyItem!.inventoryAccountId }
          : await ensureAccountByCode(
              ctx.organizationId,
              { code: "1320", name: "Finished Goods", type: "asset", subType: "current" },
              base,
              tx
            );
      if (!finishedAcct) throw new Error("Finished goods account unavailable");

      // Distribute the finished-goods debit between credits so debits === credits
      // even after per-component rounding. Components are credited at their issued
      // cost; conversion (labor/overhead) absorbs the remainder via the clearing
      // account, keeping the entry balanced to the cent.
      const creditedComponentCost = Array.from(componentCredits.values()).reduce(
        (s, v) => s + v,
        0
      );
      const clearingCredit = finishedValue - creditedComponentCost;

      const lines: {
        accountId: string;
        description: string;
        debitAmount: number;
        creditAmount: number;
        currencyCode: string;
      }[] = [
        {
          accountId: finishedAcct.id,
          description: `Assembly build: ${bom.name} x${order.quantity}`,
          debitAmount: finishedValue,
          creditAmount: 0,
          currencyCode: base,
        },
      ];

      for (const [accountId, amount] of componentCredits) {
        if (amount === 0) continue;
        lines.push({
          accountId,
          description: `Components consumed: ${bom.name}`,
          debitAmount: 0,
          creditAmount: amount,
          currencyCode: base,
        });
      }

      if (clearingCredit !== 0) {
        const clearingAcct = await ensureAccountByCode(
          ctx.organizationId,
          {
            code: "2305",
            name: "Manufacturing/WIP Clearing",
            type: "liability",
            subType: "current",
          },
          base,
          tx
        );
        if (!clearingAcct) throw new Error("WIP clearing account unavailable");
        // Positive remainder is a credit (labor/overhead applied); a negative
        // remainder (rounding) flips to a debit so the entry still balances.
        lines.push({
          accountId: clearingAcct.id,
          description: `Labor & overhead applied: ${bom.name}`,
          debitAmount: clearingCredit < 0 ? -clearingCredit : 0,
          creditAmount: clearingCredit > 0 ? clearingCredit : 0,
          currencyCode: base,
        });
      }

      const entryNumber = await getNextEntryNumber(ctx.organizationId);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: today,
          description: `Assembly build: ${bom.name} x${order.quantity}`,
          reference: "ASSEMBLY",
          status: "posted",
          sourceType: "assembly_build",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      await tx.insert(journalLine).values(
        lines.map((l) => ({ ...l, journalEntryId: entry.id }))
      );

      // 5. Stamp every movement with the JE id for traceability.
      for (const movementId of [...componentMovementIds, receipt.movementId]) {
        await tx
          .update(inventoryMovement)
          .set({ journalEntryId: entry.id })
          .where(eq(inventoryMovement.id, movementId));
      }

      // 6. Mark the order complete.
      const [updated] = await tx
        .update(assemblyOrder)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(assemblyOrder.id, id))
        .returning();

      return { updated, entryId: entry.id, totalCost, unitCost };
    });

    await logAudit({
      ctx,
      action: "complete",
      entityType: "assembly_order",
      entityId: id,
      changes: {
        quantity: order.quantity,
        totalCost: result.totalCost,
        unitCost: result.unitCost,
        journalEntryId: result.entryId,
      },
      request,
    });

    return ok({ order: result.updated, journalEntryId: result.entryId });
  } catch (err) {
    return handleError(err);
  }
}
