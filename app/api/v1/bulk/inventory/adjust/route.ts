import { db } from "@/lib/db";
import { inventoryItem, inventoryMovement } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
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

    for (const adj of adjustments) {
      const item = itemMap.get(adj.itemId);
      if (!item) continue;

      const newQty = item.quantityOnHand + adj.quantity;

      await db
        .update(inventoryItem)
        .set({ quantityOnHand: newQty, updatedAt: new Date() })
        .where(eq(inventoryItem.id, item.id));

      await db.insert(inventoryMovement).values({
        organizationId: ctx.organizationId,
        inventoryItemId: item.id,
        type: "adjustment",
        quantity: adj.quantity,
        previousQuantity: item.quantityOnHand,
        newQuantity: newQty,
        reason: adj.reason || "Bulk adjustment",
        createdBy: ctx.userId,
      });

      adjusted++;
    }

    return ok({ adjusted });
  } catch (err) {
    return handleError(err);
  }
}
