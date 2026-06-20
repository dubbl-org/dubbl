import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { createInventoryAdjustmentJournalEntry } from "@/lib/api/journal-automation";
import { type ValuedItem } from "@/lib/api/inventory-valuation";
import { z } from "zod";

const schema = z.object({
  adjustments: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.number().int(),
      reason: z.string().optional(),
    })
  ).min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const { adjustments } = schema.parse(body);

    const itemIds = adjustments.map((a) => a.itemId);
    const items = await db.query.inventoryItem.findMany({
      where: and(
        inArray(inventoryItem.id, itemIds),
        eq(inventoryItem.organizationId, ctx.organizationId)
      ),
    });

    const itemMap = new Map(items.map((i) => [i.id, i]));
    let adjusted = 0;
    const today = new Date().toISOString().slice(0, 10);

    // Each adjustment moves the quantity, revalues the stock at cost, records
    // the movement, and posts the GL (shrinkage/found vs Inventory) — instead of
    // changing only the count, which left book value and the GL untouched and
    // the balance sheet out of step with units.
    await db.transaction(async (tx) => {
      for (const adj of adjustments) {
        const item = itemMap.get(adj.itemId);
        if (!item || adj.quantity === 0) continue;
        await createInventoryAdjustmentJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            item: item as ValuedItem & { inventoryAccountId?: string | null },
            qtyDelta: adj.quantity,
            reason: adj.reason || "Bulk adjustment",
            date: today,
          },
          tx
        );
        adjusted++;
      }
    });

    return ok({ adjusted });
  } catch (err) {
    return handleError(err);
  }
}
