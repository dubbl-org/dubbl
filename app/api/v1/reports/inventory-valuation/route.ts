import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  name: inventoryItem.name,
  code: inventoryItem.code,
  quantity: inventoryItem.quantityOnHand,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const sortBy = url.searchParams.get("sortBy") || "name";
    const sortOrder = url.searchParams.get("sortOrder") || "asc";
    // method param accepted but both use purchasePrice as unit cost
    // since we don't track individual lots for FIFO
    url.searchParams.get("method"); // "weighted_average" | "fifo"

    const sortCol = SORT_COLUMNS[sortBy] || inventoryItem.name;
    const orderFn = sortOrder === "desc" ? desc : asc;

    const items = await db.query.inventoryItem.findMany({
      where: and(
        eq(inventoryItem.organizationId, ctx.organizationId),
        eq(inventoryItem.isActive, true),
        notDeleted(inventoryItem.deletedAt)
      ),
      orderBy: orderFn(sortCol),
    });

    const valuedItems = items.map((item) => {
      const unitCost = item.purchasePrice;
      const totalCost = item.quantityOnHand * unitCost;
      const totalValue = item.quantityOnHand * item.salePrice;
      const margin = totalValue - totalCost;

      const marginPercent = totalCost > 0
        ? ((totalValue - totalCost) / totalCost) * 100
        : 0;

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        quantityOnHand: item.quantityOnHand,
        unitCost,
        totalCost,
        salePrice: item.salePrice,
        totalValue,
        margin,
        marginPercent,
      };
    });

    // Handle sorting by computed fields
    if (sortBy === "totalCost" || sortBy === "totalValue" || sortBy === "marginPercent") {
      const mul = sortOrder === "desc" ? -1 : 1;
      valuedItems.sort((a, b) => {
        const key = sortBy as "totalCost" | "totalValue" | "marginPercent";
        return mul * (a[key] - b[key]);
      });
    }

    const sumCost = valuedItems.reduce((sum, i) => sum + i.totalCost, 0);
    const sumValue = valuedItems.reduce((sum, i) => sum + i.totalValue, 0);

    const summary = {
      totalItems: valuedItems.length,
      totalCost: sumCost,
      totalValue: sumValue,
      totalMargin: sumCost > 0 ? ((sumValue - sumCost) / sumCost) * 100 : 0,
    };

    return NextResponse.json({ items: valuedItems, summary });
  } catch (err) {
    return handleError(err);
  }
}
