import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockTake, stockTakeLine, inventoryItem, warehouseStock } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  warehouseId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const stockTakes = await db.query.stockTake.findMany({
      where: eq(stockTake.organizationId, ctx.organizationId),
      orderBy: desc(stockTake.createdAt),
      with: {
        lines: true,
      },
    });

    const result = stockTakes.map((st) => ({
      ...st,
      itemCount: st.lines.length,
      lines: undefined,
    }));

    return NextResponse.json({ stockTakes: result });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(stockTake)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        warehouseId: parsed.warehouseId ?? null,
        notes: parsed.notes,
        status: "draft",
        createdBy: ctx.userId,
      })
      .returning();

    // Auto-populate lines for all active non-deleted inventory items
    if (parsed.warehouseId) {
      // Use per-warehouse stock levels
      const items = await db.query.inventoryItem.findMany({
        where: and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          eq(inventoryItem.isActive, true),
          notDeleted(inventoryItem.deletedAt)
        ),
        with: {
          warehouseStocks: {
            where: eq(warehouseStock.warehouseId, parsed.warehouseId),
          },
        },
      });

      if (items.length > 0) {
        await db.insert(stockTakeLine).values(
          items.map((item) => ({
            stockTakeId: created.id,
            inventoryItemId: item.id,
            expectedQuantity: item.warehouseStocks?.[0]?.quantity ?? 0,
          }))
        );
      }
    } else {
      // Use global quantityOnHand
      const items = await db.query.inventoryItem.findMany({
        where: and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          eq(inventoryItem.isActive, true),
          notDeleted(inventoryItem.deletedAt)
        ),
      });

      if (items.length > 0) {
        await db.insert(stockTakeLine).values(
          items.map((item) => ({
            stockTakeId: created.id,
            inventoryItemId: item.id,
            expectedQuantity: item.quantityOnHand,
          }))
        );
      }
    }

    return NextResponse.json({ stockTake: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
