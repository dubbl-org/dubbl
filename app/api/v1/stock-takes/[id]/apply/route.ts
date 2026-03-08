import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  stockTake,
  stockTakeLine,
  inventoryItem,
  inventoryMovement,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

    return NextResponse.json({
      success: true,
      adjustedCount,
    });
  } catch (err) {
    return handleError(err);
  }
}
