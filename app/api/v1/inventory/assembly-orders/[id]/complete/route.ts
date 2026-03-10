import { db } from "@/lib/db";
import { assemblyOrder, billOfMaterials, bomComponent, inventoryItem, inventoryMovement } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, error, handleError } from "@/lib/api/response";

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

    // Check component availability
    for (const comp of bom.components) {
      const needed = Math.ceil(parseFloat(comp.quantity) * order.quantity * (1 + parseFloat(comp.wastagePercent || "0") / 100));
      if ((comp.componentItem?.quantityOnHand || 0) < needed) {
        return error(`Insufficient stock for ${comp.componentItem?.name || "component"}: need ${needed}, have ${comp.componentItem?.quantityOnHand || 0}`, 409);
      }
    }

    // Deduct components
    for (const comp of bom.components) {
      const needed = Math.ceil(parseFloat(comp.quantity) * order.quantity * (1 + parseFloat(comp.wastagePercent || "0") / 100));
      const item = comp.componentItem!;
      const newQty = item.quantityOnHand - needed;

      await db.update(inventoryItem)
        .set({ quantityOnHand: newQty, updatedAt: new Date() })
        .where(eq(inventoryItem.id, item.id));

      await db.insert(inventoryMovement).values({
        organizationId: ctx.organizationId,
        inventoryItemId: item.id,
        type: "sale",
        quantity: -needed,
        previousQuantity: item.quantityOnHand,
        newQuantity: newQty,
        reason: `Assembly: ${bom.name} x${order.quantity}`,
        referenceType: "assembly_order",
        referenceId: order.id,
        createdBy: ctx.userId,
      });
    }

    // Add assembled items
    const assemblyItem = bom.assemblyItem;
    const addedQty = order.quantity;
    const newAssemblyQty = assemblyItem.quantityOnHand + addedQty;

    await db.update(inventoryItem)
      .set({ quantityOnHand: newAssemblyQty, updatedAt: new Date() })
      .where(eq(inventoryItem.id, assemblyItem.id));

    await db.insert(inventoryMovement).values({
      organizationId: ctx.organizationId,
      inventoryItemId: assemblyItem.id,
      type: "purchase",
      quantity: addedQty,
      previousQuantity: assemblyItem.quantityOnHand,
      newQuantity: newAssemblyQty,
      reason: `Assembly completed: ${bom.name} x${order.quantity}`,
      referenceType: "assembly_order",
      referenceId: order.id,
      createdBy: ctx.userId,
    });

    // Mark order as completed
    const [updated] = await db
      .update(assemblyOrder)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(assemblyOrder.id, id))
      .returning();

    return ok({ order: updated });
  } catch (err) {
    return handleError(err);
  }
}
