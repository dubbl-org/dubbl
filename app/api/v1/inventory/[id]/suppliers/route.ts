import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryItemSupplier, contact } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  contactId: z.string().uuid(),
  supplierCode: z.string().optional(),
  leadTimeDays: z.number().int().optional(),
  purchasePrice: z.number().int().optional(),
  isPreferred: z.boolean().optional(),
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

    const suppliers = await db
      .select({
        id: inventoryItemSupplier.id,
        inventoryItemId: inventoryItemSupplier.inventoryItemId,
        contactId: inventoryItemSupplier.contactId,
        supplierCode: inventoryItemSupplier.supplierCode,
        leadTimeDays: inventoryItemSupplier.leadTimeDays,
        purchasePrice: inventoryItemSupplier.purchasePrice,
        isPreferred: inventoryItemSupplier.isPreferred,
        createdAt: inventoryItemSupplier.createdAt,
        updatedAt: inventoryItemSupplier.updatedAt,
        contactName: contact.name,
        contactEmail: contact.email,
      })
      .from(inventoryItemSupplier)
      .innerJoin(contact, eq(inventoryItemSupplier.contactId, contact.id))
      .where(
        and(
          eq(inventoryItemSupplier.inventoryItemId, id),
          eq(inventoryItemSupplier.organizationId, ctx.organizationId)
        )
      );

    return NextResponse.json({ data: suppliers });
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
      .insert(inventoryItemSupplier)
      .values({
        organizationId: ctx.organizationId,
        inventoryItemId: id,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ inventoryItemSupplier: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
