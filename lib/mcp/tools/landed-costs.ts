import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  landedCostAllocation,
  landedCostComponent,
  landedCostLineAllocation,
  purchaseOrderLine,
  inventoryItem,
  inventoryCostLayer,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import {
  getNextEntryNumber,
  ensureControlAccount,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Landed-cost MCP tools: capture freight/duty/insurance/handling costs against a
 * purchase order and capitalise them onto the inventory items behind its lines
 * so stock is revalued at its true landed-in cost.
 *
 * CONVENTIONS (matching the REST routes and the rest of the codebase):
 *  • MONETARY AMOUNTS are integer cents (e.g. $12.50 = 1250). Component `amount`
 *    inputs on create are DECIMAL numbers (e.g. 12.50) for convenience and are
 *    converted to cents internally (x100), exactly like the REST create route.
 *  • PO-line quantities are stored x100 (5 units = 500).
 *  • All tools are org-scoped via the AuthContext and use direct Drizzle access
 *    (no HTTP self-calls). Allocation posts the matching double-entry journal so
 *    the GL and the perpetual inventory stay in lock-step.
 */
export function registerLandedCostTools(server: McpServer, ctx: AuthContext) {
  // ─── List landed-cost allocations ───────────────────────────────────
  server.tool(
    "list_landed_costs",
    "List landed-cost allocations for the organization, newest first. Each allocation captures additional costs (freight, duty, insurance, handling, etc.) to be spread onto a bill or purchase order's inventory. totalCostAmount is integer cents; status is 'draft' (not yet capitalised) or 'allocated' (capitalised to stock + GL). Returns paginated allocations with their components, linked bill, and purchase order.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of allocations to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(landedCostAllocation.organizationId, ctx.organizationId),
          notDeleted(landedCostAllocation.deletedAt),
        ];

        const offset = (params.page - 1) * params.limit;
        const items = await db.query.landedCostAllocation.findMany({
          where: and(...conditions),
          orderBy: desc(landedCostAllocation.createdAt),
          limit: params.limit,
          offset,
          with: { components: true, bill: true, purchaseOrder: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(landedCostAllocation)
          .where(and(...conditions));

        return {
          allocations: items,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ─── Get a single landed-cost allocation ────────────────────────────
  server.tool(
    "get_landed_cost",
    "Get a single landed-cost allocation by ID with its cost components, any per-line allocations already computed, the linked bill, and the purchase order (with its lines). totalCostAmount and component/allocation amounts are integer cents; PO-line quantities are stored x100.",
    {
      landedCostId: z
        .string()
        .uuid()
        .describe("The UUID of the landed-cost allocation"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const item = await db.query.landedCostAllocation.findFirst({
          where: and(
            eq(landedCostAllocation.id, params.landedCostId),
            eq(landedCostAllocation.organizationId, ctx.organizationId),
            notDeleted(landedCostAllocation.deletedAt)
          ),
          with: {
            components: true,
            lineAllocations: true,
            bill: true,
            purchaseOrder: { with: { lines: true } },
          },
        });
        if (!item) throw new Error("Landed cost allocation not found");
        return { allocation: item };
      })
  );

  // ─── Create a landed-cost allocation ────────────────────────────────
  server.tool(
    "create_landed_cost",
    "Create a draft landed-cost allocation: a named bucket of additional costs (freight, duty, insurance, handling, etc.) to be spread onto a purchase order's (or bill's) inventory. Each component's `amount` is a DECIMAL number (e.g. 12.50 for $12.50) and is converted to cents internally; totalCostAmount is the sum of the components in cents. Link a purchaseOrderId so it can later be allocated to stock (allocation requires a PO). The allocation starts in 'draft'; call allocate_landed_cost to capitalise it. Returns the created allocation.",
    {
      name: z
        .string()
        .min(1)
        .describe("Name / short description of this landed-cost batch (e.g. 'Import freight & duty — shipment #42')"),
      billId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional bill UUID this landed cost relates to"),
      purchaseOrderId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional purchase order UUID. Required (set here) before allocation, since costs are spread across the PO's lines."),
      allocationMethod: z
        .enum(["by_value", "by_quantity", "by_weight", "manual"])
        .optional()
        .default("by_value")
        .describe("How costs are spread across PO lines: 'by_value' (default, pro-rata by line amount) or 'by_quantity' (pro-rata by line quantity). 'by_weight' and 'manual' are accepted but currently fall back to by-value basis at allocation."),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code (ISO 4217, e.g. USD); defaults to USD"),
      components: z
        .array(
          z.object({
            description: z
              .string()
              .min(1)
              .describe("Cost component description (e.g. 'Ocean freight', 'Customs duty')"),
            amount: z
              .number()
              .min(0)
              .describe("Component amount as a DECIMAL (e.g. 12.50 for $12.50); converted to cents internally"),
            accountId: z
              .string()
              .nullable()
              .optional()
              .describe("Optional chart-account UUID this component is sourced from"),
          })
        )
        .min(1)
        .describe("The cost components that make up this landed cost (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");

        const totalCostAmount = params.components.reduce(
          (sum, c) => sum + Math.round(c.amount * 100),
          0
        );

        const [created] = await db
          .insert(landedCostAllocation)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            billId: params.billId || null,
            purchaseOrderId: params.purchaseOrderId || null,
            allocationMethod: params.allocationMethod,
            totalCostAmount,
            currencyCode: params.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(landedCostComponent).values(
          params.components.map((c) => ({
            allocationId: created.id,
            description: c.description,
            amount: Math.round(c.amount * 100),
            accountId: c.accountId || null,
          }))
        );

        return { allocation: created };
      })
  );

  // ─── Allocate (capitalise) a landed-cost allocation ─────────────────
  server.tool(
    "allocate_landed_cost",
    "Allocate (capitalise) a DRAFT landed-cost allocation onto the inventory behind its purchase order. Spreads each cost component across the PO lines pro-rata by line value (or quantity when allocationMethod is 'by_quantity'), then for every PO line backed by an inventory item: raises the item's on-hand book value, recomputes its moving-average unit cost, and (for FIFO items) capitalises each open cost layer's share into its unit cost. Posts ONE balanced journal entry dated today: DR each item's Inventory account (falling back to control account 1300) / CR Landed Costs Clearing 2160 for the total capitalised. Marks the allocation 'allocated'. The allocation must be 'draft' and MUST have a purchaseOrderId with at least one line. Returns the updated allocation, the per-line allocations, and the posted journalEntryId (null if nothing capitalised to inventory).",
    {
      landedCostId: z
        .string()
        .uuid()
        .describe("The UUID of the draft landed-cost allocation to allocate"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");

        const allocation = await db.query.landedCostAllocation.findFirst({
          where: and(
            eq(landedCostAllocation.id, params.landedCostId),
            eq(landedCostAllocation.organizationId, ctx.organizationId),
            eq(landedCostAllocation.status, "draft"),
            notDeleted(landedCostAllocation.deletedAt)
          ),
          with: { components: true },
        });

        if (!allocation) throw new Error("Draft landed cost allocation not found");
        if (!allocation.purchaseOrderId) {
          throw new Error("Purchase order required for allocation");
        }

        // Get PO lines.
        const poLines = await db.query.purchaseOrderLine.findMany({
          where: eq(purchaseOrderLine.purchaseOrderId, allocation.purchaseOrderId),
        });

        if (poLines.length === 0) {
          throw new Error("No purchase order lines found");
        }

        // Calculate allocation basis.
        const totalBasis =
          allocation.allocationMethod === "by_quantity"
            ? poLines.reduce((sum, l) => sum + l.quantity, 0)
            : poLines.reduce((sum, l) => sum + l.amount, 0); // by_value default

        // Allocate each component across PO lines.
        const lineAllocations: {
          allocationId: string;
          componentId: string;
          purchaseOrderLineId: string;
          allocatedAmount: number;
          allocationBasis: number;
        }[] = [];
        for (const component of allocation.components) {
          for (const poLine of poLines) {
            const basis =
              allocation.allocationMethod === "by_quantity"
                ? poLine.quantity
                : poLine.amount;
            const allocatedAmount =
              totalBasis > 0
                ? Math.round((component.amount * basis) / totalBasis)
                : 0;

            lineAllocations.push({
              allocationId: params.landedCostId,
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

            const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
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
            .where(eq(landedCostAllocation.id, params.landedCostId))
            .returning();

          return { updated, entryId };
        });

        return {
          allocation: result.updated,
          lineAllocations,
          journalEntryId: result.entryId,
        };
      })
  );
}
