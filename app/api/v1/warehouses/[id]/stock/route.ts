import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { warehouseStock, inventoryItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const stocks = await db
      .select({
        id: warehouseStock.id,
        inventoryItemId: warehouseStock.inventoryItemId,
        itemName: inventoryItem.name,
        itemCode: inventoryItem.code,
        itemSku: inventoryItem.sku,
        quantity: warehouseStock.quantity,
        updatedAt: warehouseStock.updatedAt,
      })
      .from(warehouseStock)
      .innerJoin(inventoryItem, eq(warehouseStock.inventoryItemId, inventoryItem.id))
      .where(
        and(
          eq(warehouseStock.warehouseId, id),
          eq(warehouseStock.organizationId, ctx.organizationId),
          notDeleted(inventoryItem.deletedAt)
        )
      );

    return NextResponse.json({ data: stocks });
  } catch (err) {
    return handleError(err);
  }
}
