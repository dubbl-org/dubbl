import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const bulkSchema = z.object({
  action: z.enum(["delete", "set_active", "set_inactive", "set_category", "adjust_stock"]),
  ids: z.array(z.string().uuid()).min(1),
  category: z.string().optional(),
  adjustment: z.number().int().optional(),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const { action, ids, category, adjustment } = bulkSchema.parse(body);

    // Verify all items belong to this org
    const items = await db.query.inventoryItem.findMany({
      where: and(
        eq(inventoryItem.organizationId, ctx.organizationId),
        inArray(inventoryItem.id, ids),
        notDeleted(inventoryItem.deletedAt)
      ),
    });

    if (items.length !== ids.length) {
      return NextResponse.json({ error: "Some items not found" }, { status: 404 });
    }

    switch (action) {
      case "delete":
        await db
          .update(inventoryItem)
          .set(softDelete())
          .where(
            and(
              eq(inventoryItem.organizationId, ctx.organizationId),
              inArray(inventoryItem.id, ids)
            )
          );
        for (const item of items) {
          logAudit({
            ctx,
            action: "delete",
            entityType: "inventory_item",
            entityId: item.id,
            changes: item as Record<string, unknown>,
            request,
          });
        }
        break;

      case "set_active":
        await db
          .update(inventoryItem)
          .set({ isActive: true, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryItem.organizationId, ctx.organizationId),
              inArray(inventoryItem.id, ids)
            )
          );
        break;

      case "set_inactive":
        await db
          .update(inventoryItem)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryItem.organizationId, ctx.organizationId),
              inArray(inventoryItem.id, ids)
            )
          );
        break;

      case "set_category":
        if (category === undefined) {
          return NextResponse.json({ error: "Category required" }, { status: 400 });
        }
        await db
          .update(inventoryItem)
          .set({ category: category || null, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryItem.organizationId, ctx.organizationId),
              inArray(inventoryItem.id, ids)
            )
          );
        break;

      case "adjust_stock":
        if (adjustment === undefined || adjustment === 0) {
          return NextResponse.json({ error: "Adjustment required" }, { status: 400 });
        }
        for (const item of items) {
          const newQty = item.quantityOnHand + adjustment;
          if (newQty < 0) {
            return NextResponse.json(
              { error: `Adjustment would make "${item.name}" quantity negative` },
              { status: 400 }
            );
          }
        }
        for (const item of items) {
          await db
            .update(inventoryItem)
            .set({
              quantityOnHand: item.quantityOnHand + adjustment,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItem.id, item.id));
        }
        break;
    }

    return NextResponse.json({ success: true, affected: ids.length });
  } catch (err) {
    return handleError(err);
  }
}
