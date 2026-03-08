import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, inventoryItemSupplier, contact } from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const items = await db.query.inventoryItem.findMany({
      where: and(
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt),
        eq(inventoryItem.isActive, true),
        sql`${inventoryItem.quantityOnHand} <= ${inventoryItem.reorderPoint}`
      ),
      orderBy: desc(inventoryItem.name),
    });

    const result = await Promise.all(
      items.map(async (item) => {
        const suppliers = await db
          .select({
            id: inventoryItemSupplier.id,
            contactId: inventoryItemSupplier.contactId,
            supplierCode: inventoryItemSupplier.supplierCode,
            leadTimeDays: inventoryItemSupplier.leadTimeDays,
            purchasePrice: inventoryItemSupplier.purchasePrice,
            isPreferred: inventoryItemSupplier.isPreferred,
            contactName: contact.name,
            contactEmail: contact.email,
          })
          .from(inventoryItemSupplier)
          .innerJoin(contact, eq(inventoryItemSupplier.contactId, contact.id))
          .where(
            and(
              eq(inventoryItemSupplier.inventoryItemId, item.id),
              eq(inventoryItemSupplier.organizationId, ctx.organizationId)
            )
          )
          .orderBy(desc(inventoryItemSupplier.isPreferred));

        return {
          ...item,
          suggestedReorderQuantity: item.reorderPoint * 2 - item.quantityOnHand,
          suppliers,
        };
      })
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    return handleError(err);
  }
}
