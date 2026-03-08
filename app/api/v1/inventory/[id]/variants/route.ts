import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryVariant } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  purchasePrice: z.number().int().default(0),
  salePrice: z.number().int().default(0),
  quantityOnHand: z.number().int().default(0),
  options: z.record(z.string(), z.string()),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!item) return notFound("Inventory item");

    const variants = await db.query.inventoryVariant.findMany({
      where: and(
        eq(inventoryVariant.inventoryItemId, id),
        eq(inventoryVariant.organizationId, ctx.organizationId),
        notDeleted(inventoryVariant.deletedAt)
      ),
      orderBy: asc(inventoryVariant.name),
    });

    return NextResponse.json({ data: variants });
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

    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (!item) return notFound("Inventory item");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(inventoryVariant)
      .values({
        organizationId: ctx.organizationId,
        inventoryItemId: id,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ inventoryVariant: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
