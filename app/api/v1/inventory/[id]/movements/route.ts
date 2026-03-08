import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryMovement } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!item) return notFound("Inventory item");

    const movements = await db.query.inventoryMovement.findMany({
      where: and(
        eq(inventoryMovement.inventoryItemId, id),
        eq(inventoryMovement.organizationId, ctx.organizationId)
      ),
      orderBy: desc(inventoryMovement.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: db.$count(inventoryMovement) })
      .from(inventoryMovement)
      .where(
        and(
          eq(inventoryMovement.inventoryItemId, id),
          eq(inventoryMovement.organizationId, ctx.organizationId)
        )
      );

    return NextResponse.json(
      paginatedResponse(movements, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}
