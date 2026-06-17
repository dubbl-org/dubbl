import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceList, priceListItem, inventoryItem } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, error } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import type { AuthContext } from "@/lib/api/auth-context";

// Confirm the price list exists and is owned by the caller's org.
async function loadOwnedList(ctx: AuthContext, listId: string) {
  return db.query.priceList.findFirst({
    where: and(
      eq(priceList.id, listId),
      eq(priceList.organizationId, ctx.organizationId),
      notDeleted(priceList.deletedAt)
    ),
  });
}

const createSchema = z.object({
  inventoryItemId: z.string().uuid(),
  unitPrice: z.number().int().min(0),
  minQuantity: z.number().int().min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const list = await loadOwnedList(ctx, id);
    if (!list) return notFound("Price list");

    const items = await db.query.priceListItem.findMany({
      where: eq(priceListItem.priceListId, id),
      with: { inventoryItem: true },
      orderBy: asc(priceListItem.minQuantity),
    });

    return NextResponse.json({ data: items });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const list = await loadOwnedList(ctx, id);
    if (!list) return notFound("Price list");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // The inventory item must belong to the same org.
    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, parsed.inventoryItemId),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });
    if (!item) return notFound("Inventory item");

    const minQuantity = parsed.minQuantity ?? 1;

    // Enforce one row per (list, item, tier).
    const existing = await db.query.priceListItem.findFirst({
      where: and(
        eq(priceListItem.priceListId, id),
        eq(priceListItem.inventoryItemId, parsed.inventoryItemId),
        eq(priceListItem.minQuantity, minQuantity)
      ),
    });
    if (existing) {
      return error(
        "A price already exists for this item at this minimum quantity",
        409
      );
    }

    const [created] = await db
      .insert(priceListItem)
      .values({
        priceListId: id,
        inventoryItemId: parsed.inventoryItemId,
        unitPrice: parsed.unitPrice,
        minQuantity,
      })
      .returning();

    logAudit({
      ctx,
      action: "create",
      entityType: "price_list_item",
      entityId: created.id,
      changes: created as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ priceListItem: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
