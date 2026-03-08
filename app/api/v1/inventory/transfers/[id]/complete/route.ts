import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  inventoryTransfer,
  inventoryTransferLine,
  warehouseStock,
  inventoryMovement,
  inventoryItem,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const transfer = await db.query.inventoryTransfer.findFirst({
      where: and(
        eq(inventoryTransfer.id, id),
        eq(inventoryTransfer.organizationId, ctx.organizationId)
      ),
      with: { lines: true },
    });

    if (!transfer) return notFound("Transfer");
    if (transfer.status === "completed") {
      return NextResponse.json({ error: "Transfer already completed" }, { status: 400 });
    }
    if (transfer.status === "cancelled") {
      return NextResponse.json({ error: "Transfer is cancelled" }, { status: 400 });
    }

    // Process each line
    for (const line of transfer.lines) {
      // Get current item quantity
      const item = await db.query.inventoryItem.findFirst({
        where: eq(inventoryItem.id, line.inventoryItemId),
      });
      if (!item) continue;

      const qty = line.quantity;

      // Update from warehouse stock (decrease)
      await db
        .insert(warehouseStock)
        .values({
          organizationId: ctx.organizationId,
          inventoryItemId: line.inventoryItemId,
          warehouseId: transfer.fromWarehouseId,
          quantity: -qty,
        })
        .onConflictDoUpdate({
          target: [warehouseStock.organizationId, warehouseStock.inventoryItemId, warehouseStock.warehouseId],
          set: {
            quantity: sql`${warehouseStock.quantity} - ${qty}`,
            updatedAt: new Date(),
          },
        });

      // Update to warehouse stock (increase)
      await db
        .insert(warehouseStock)
        .values({
          organizationId: ctx.organizationId,
          inventoryItemId: line.inventoryItemId,
          warehouseId: transfer.toWarehouseId,
          quantity: qty,
        })
        .onConflictDoUpdate({
          target: [warehouseStock.organizationId, warehouseStock.inventoryItemId, warehouseStock.warehouseId],
          set: {
            quantity: sql`${warehouseStock.quantity} + ${qty}`,
            updatedAt: new Date(),
          },
        });

      // Create movement records
      await db.insert(inventoryMovement).values([
        {
          organizationId: ctx.organizationId,
          inventoryItemId: line.inventoryItemId,
          warehouseId: transfer.fromWarehouseId,
          type: "transfer_out",
          quantity: -qty,
          previousQuantity: item.quantityOnHand,
          newQuantity: item.quantityOnHand, // global qty unchanged for transfers
          reason: `Transfer to warehouse`,
          referenceType: "transfer",
          referenceId: transfer.id,
          createdBy: ctx.userId,
        },
        {
          organizationId: ctx.organizationId,
          inventoryItemId: line.inventoryItemId,
          warehouseId: transfer.toWarehouseId,
          type: "transfer_in",
          quantity: qty,
          previousQuantity: item.quantityOnHand,
          newQuantity: item.quantityOnHand,
          reason: `Transfer from warehouse`,
          referenceType: "transfer",
          referenceId: transfer.id,
          createdBy: ctx.userId,
        },
      ]);

      // Update received quantity
      await db
        .update(inventoryTransferLine)
        .set({ receivedQuantity: qty })
        .where(eq(inventoryTransferLine.id, line.id));
    }

    // Mark transfer as completed
    const [updated] = await db
      .update(inventoryTransfer)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(inventoryTransfer.id, id))
      .returning();

    const full = await db.query.inventoryTransfer.findFirst({
      where: eq(inventoryTransfer.id, updated.id),
      with: { fromWarehouse: true, toWarehouse: true, lines: true },
    });

    return NextResponse.json({ transfer: full });
  } catch (err) {
    return handleError(err);
  }
}
