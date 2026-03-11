import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  stockTake,
  stockTakeLine,
  inventoryItem,
  inventoryMovement,
  warehouseStock,
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

    const st = await db.query.stockTake.findFirst({
      where: and(
        eq(stockTake.id, id),
        eq(stockTake.organizationId, ctx.organizationId)
      ),
      with: {
        lines: true,
      },
    });

    if (!st) {
      return notFound("Stock take");
    }

    if (st.status !== "in_progress") {
      return NextResponse.json(
        { error: "Stock take must be in progress to apply adjustments" },
        { status: 400 }
      );
    }

    // Filter lines that have been counted and have a discrepancy
    const linesToAdjust = st.lines.filter(
      (line) => line.countedQuantity !== null && line.discrepancy !== 0
    );

    let adjustedCount = 0;

    for (const line of linesToAdjust) {
      // Get current inventory item
      const item = await db.query.inventoryItem.findFirst({
        where: eq(inventoryItem.id, line.inventoryItemId),
      });

      if (!item) continue;

      const previousQuantity = item.quantityOnHand;
      const newQuantity = line.countedQuantity!;

      // Update inventory item quantity
      await db
        .update(inventoryItem)
        .set({
          quantityOnHand: newQuantity,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItem.id, line.inventoryItemId));

      // Update warehouse stock if stock take is scoped to a warehouse
      if (st.warehouseId) {
        await db
          .insert(warehouseStock)
          .values({
            organizationId: ctx.organizationId,
            inventoryItemId: line.inventoryItemId,
            warehouseId: st.warehouseId,
            quantity: newQuantity,
          })
          .onConflictDoUpdate({
            target: [
              warehouseStock.organizationId,
              warehouseStock.inventoryItemId,
              warehouseStock.warehouseId,
            ],
            set: {
              quantity: sql`${newQuantity}`,
              updatedAt: new Date(),
            },
          });
      }

      // Insert inventory movement
      await db.insert(inventoryMovement).values({
        organizationId: ctx.organizationId,
        inventoryItemId: line.inventoryItemId,
        warehouseId: st.warehouseId,
        type: "stock_take",
        quantity: line.discrepancy!,
        previousQuantity,
        newQuantity,
        reason: `Stock take: ${st.name}`,
        referenceType: "stock_take",
        referenceId: st.id,
        createdBy: ctx.userId,
      });

      // Mark line as adjusted
      await db
        .update(stockTakeLine)
        .set({ adjusted: true, updatedAt: new Date() })
        .where(eq(stockTakeLine.id, line.id));

      adjustedCount++;
    }

    // Update stock take status to completed
    await db
      .update(stockTake)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockTake.id, id));

    const updatedSt = await db.query.stockTake.findFirst({
      where: and(eq(stockTake.id, id), eq(stockTake.organizationId, ctx.organizationId)),
      with: {
        lines: {
          with: {
            inventoryItem: {
              columns: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ stockTake: updatedSt, adjustedCount });
  } catch (err) {
    return handleError(err);
  }
}
