import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  landedCostAllocation,
  landedCostLineAllocation,
  purchaseOrderLine,
  inventoryItem,
  inventoryCostLayer,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import {
  getNextEntryNumber,
  ensureControlAccount,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const allocation = await db.query.landedCostAllocation.findFirst({
      where: and(
        eq(landedCostAllocation.id, id),
        eq(landedCostAllocation.organizationId, ctx.organizationId),
        eq(landedCostAllocation.status, "draft"),
        notDeleted(landedCostAllocation.deletedAt)
      ),
      with: { components: true },
    });

    if (!allocation) return notFound("Draft landed cost allocation");
    if (!allocation.purchaseOrderId) {
      return NextResponse.json({ error: "Purchase order required for allocation" }, { status: 400 });
    }

    // Get PO lines
    const poLines = await db.query.purchaseOrderLine.findMany({
      where: eq(purchaseOrderLine.purchaseOrderId, allocation.purchaseOrderId),
    });

    if (poLines.length === 0) {
      return NextResponse.json({ error: "No purchase order lines found" }, { status: 400 });
    }

    // Calculate allocation basis
    const totalBasis = allocation.allocationMethod === "by_quantity"
      ? poLines.reduce((sum, l) => sum + l.quantity, 0)
      : poLines.reduce((sum, l) => sum + l.amount, 0); // by_value default

    // Allocate each component across PO lines
    const lineAllocations: {
      allocationId: string;
      componentId: string;
      purchaseOrderLineId: string;
      allocatedAmount: number;
      allocationBasis: number;
    }[] = [];
    for (const component of allocation.components) {
      for (const poLine of poLines) {
        const basis = allocation.allocationMethod === "by_quantity"
          ? poLine.quantity
          : poLine.amount;
        const allocatedAmount = totalBasis > 0
          ? Math.round((component.amount * basis) / totalBasis)
          : 0;

        lineAllocations.push({
          allocationId: id,
          componentId: component.id,
          purchaseOrderLineId: poLine.id,
          allocatedAmount,
          allocationBasis: basis,
        });
      }
    }

    // Roll allocated landed cost up to the inventory item behind each PO line so
    // the stock is actually revalued (not just recorded). Lines without an
    // inventory item (expense/service lines) simply don't raise inventory value.
    const itemCost = new Map<string, number>(); // inventoryItemId -> landed cost added
    for (const la of lineAllocations) {
      if (la.allocatedAmount === 0) continue;
      const poLine = poLines.find((l) => l.id === la.purchaseOrderLineId);
      if (!poLine?.inventoryItemId) continue;
      itemCost.set(
        poLine.inventoryItemId,
        (itemCost.get(poLine.inventoryItemId) ?? 0) + la.allocatedAmount
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const { base } = await resolveBaseRate(ctx.organizationId, undefined, today);

    const result = await db.transaction(async (tx) => {
      let entryId: string | null = null;
      const debitsByAccount = new Map<string, number>(); // inventory accountId -> debit
      let totalLandedToInventory = 0;

      for (const [inventoryItemId, addedCost] of itemCost) {
        const item = await tx.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId)
          ),
        });
        if (!item) continue; // skip items that don't belong to this org

        // Raise the on-hand book value and recompute the moving-average unit cost.
        const newValue = item.totalValue + addedCost;
        const newAvg =
          item.quantityOnHand > 0
            ? Math.round(newValue / item.quantityOnHand)
            : item.averageCost;

        await tx
          .update(inventoryItem)
          .set({ totalValue: newValue, averageCost: newAvg, updatedAt: new Date() })
          .where(eq(inventoryItem.id, item.id));

        // For FIFO items, spread the landed cost across the open layers so future
        // issues consume at the landed-in cost, not the bare purchase cost.
        if (item.costMethod === "fifo") {
          const layers = await tx
            .select()
            .from(inventoryCostLayer)
            .where(
              and(
                eq(inventoryCostLayer.organizationId, ctx.organizationId),
                eq(inventoryCostLayer.inventoryItemId, item.id),
                sql`${inventoryCostLayer.remainingQuantity} > 0`
              )
            )
            .orderBy(asc(inventoryCostLayer.receivedAt), asc(inventoryCostLayer.id))
            .for("update");

          const totalRemaining = layers.reduce((s, l) => s + l.remainingQuantity, 0);
          if (totalRemaining > 0) {
            let distributed = 0;
            for (let i = 0; i < layers.length; i++) {
              const layer = layers[i];
              // Last layer absorbs the rounding remainder so the spread is exact.
              const share =
                i === layers.length - 1
                  ? addedCost - distributed
                  : Math.round((addedCost * layer.remainingQuantity) / totalRemaining);
              distributed += share;
              // Capitalize this layer's share of landed cost into its unit cost.
              const newUnitCost = Math.round(
                (layer.unitCost * layer.remainingQuantity + share) /
                  layer.remainingQuantity
              );
              await tx
                .update(inventoryCostLayer)
                .set({ unitCost: newUnitCost })
                .where(eq(inventoryCostLayer.id, layer.id));
            }
          }
        }

        // The inventory debit posts to the item's own inventory account, falling
        // back to the 1300 control account.
        const invAcct = item.inventoryAccountId
          ? { id: item.inventoryAccountId }
          : await ensureControlAccount(ctx.organizationId, "inventory", base, tx);
        if (!invAcct) throw new Error("Inventory control account unavailable");
        debitsByAccount.set(
          invAcct.id,
          (debitsByAccount.get(invAcct.id) ?? 0) + addedCost
        );
        totalLandedToInventory += addedCost;
      }

      // Post the GL: DR Inventory (per account) / CR Landed Costs Clearing 2160.
      if (totalLandedToInventory > 0) {
        const clearingAcct = await ensureAccountByCode(
          ctx.organizationId,
          {
            code: "2160",
            name: "Landed Costs Clearing",
            type: "liability",
            subType: "current",
          },
          base,
          tx
        );
        if (!clearingAcct) throw new Error("Landed costs clearing account unavailable");

        const lines: {
          journalEntryId: string;
          accountId: string;
          description: string;
          debitAmount: number;
          creditAmount: number;
          currencyCode: string;
        }[] = [];

        const entryNumber = await getNextEntryNumber(ctx.organizationId);
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: today,
            description: `Landed cost allocation: ${allocation.name}`,
            reference: "LANDED-COST",
            status: "posted",
            sourceType: "landed_cost",
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        entryId = entry.id;

        for (const [accountId, amount] of debitsByAccount) {
          if (amount === 0) continue;
          lines.push({
            journalEntryId: entry.id,
            accountId,
            description: `Landed cost capitalized: ${allocation.name}`,
            debitAmount: amount,
            creditAmount: 0,
            currencyCode: base,
          });
        }
        lines.push({
          journalEntryId: entry.id,
          accountId: clearingAcct.id,
          description: `Landed cost cleared: ${allocation.name}`,
          debitAmount: 0,
          creditAmount: totalLandedToInventory,
          currencyCode: base,
        });

        await tx.insert(journalLine).values(lines);
      }

      if (lineAllocations.length > 0) {
        await tx.insert(landedCostLineAllocation).values(lineAllocations);
      }

      const [updated] = await tx
        .update(landedCostAllocation)
        .set({
          status: "allocated",
          allocatedAt: new Date(),
          updatedAt: new Date(),
          ...(entryId ? { journalEntryId: entryId } : {}),
        })
        .where(eq(landedCostAllocation.id, id))
        .returning();

      return { updated, entryId };
    });

    await logAudit({
      ctx,
      action: "allocate",
      entityType: "landed_cost_allocation",
      entityId: id,
      changes: {
        journalEntryId: result.entryId,
        itemsRevalued: Array.from(itemCost.keys()),
      },
      request,
    });

    return NextResponse.json({
      allocation: result.updated,
      lineAllocations,
      journalEntryId: result.entryId,
    });
  } catch (err) {
    return handleError(err);
  }
}
